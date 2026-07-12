import { afterNextRender, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal, computed, Inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Room } from '../../DTO/room';
import { TooltipDirective } from '../../Directives/tooltip';
import { SetUsernameDialog } from './Component/set-username-dialog/set-username-dialog';
import { ConfirmDeleteDialog } from './Component/confirm-delete-dialog/confirm-delete-dialog';
import { AddRoomDialog } from './Component/add-room-dialog/add-room-dialog';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConnectionStatus, HubChatSignalR } from '../../Services/HubChat/hub-chat-signal-r';
import { Result, ResultOf } from '../../DTO/result';
import { Message } from '../../DTO/message.dto';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { EXTERNAL_URLS } from '../../Constants/external-urls';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss'],
  imports: [NgClass, FormsModule, TooltipDirective, MatDialogModule, MatButtonModule]
})
export class ChatComponent implements OnInit, OnDestroy {
  // #region Component Properties & State
  @ViewChild('chatMessagesArea') private chatMessagesArea?: ElementRef<HTMLDivElement>;

  // --- Injected Services ---
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private overlay = inject(Overlay);
  private overlayRef?: OverlayRef;
  // Subject để quản lý việc hủy các subscription khi component bị phá hủy
  private readonly destroy$ = new Subject<void>();

  // --- Component State ---
  isSidebarExpanded: boolean = true; // Trạng thái đóng/mở của thanh bên
  isServerRunning: boolean = false; // Cờ đánh dấu server đã sẵn sàng hay chưa
  newMessage: string = ''; // Nội dung tin nhắn đang soạn thảo
  serverWakeUpAttemptCount = 0; // Bộ đếm số lần thử "đánh thức" server
  isUserNearBottom = signal(true); // Signal theo dõi real-time xem người dùng có ở gần cuối không

  // #endregion
  // --- Signal-based State: Quản lý trạng thái hiện đại với Angular Signals ---
  userName = signal("");
  messages = signal<{ [key: string]: Message[] }>({
    'Roomdefault': [{ roomId: 'Roomdefault', userName: 'User 1', messageValue: 'Hello from User 1' }]
  });
  rooms = signal<Room[]>([]);
  roomsWithNewMessages = signal<string[]>([]);
  currentRoomId = signal("Roomdefault");

  // --- Computed Signals: Các signal dẫn xuất, tự động tính toán lại khi phụ thuộc thay đổi ---
  /** Signal chứa thông tin của phòng chat đang được chọn. */
  currentRoom = computed(() => this.rooms().find(room => room.roomId === this.currentRoomId()));
  /** Signal chứa danh sách tin nhắn của phòng chat hiện tại. */
  currentMessages = computed(() => this.messages()[this.currentRoomId()] ?? []);
  // #endregion

  // #region Lifecycle Hooks

  constructor(private HubChatSignalR: HubChatSignalR, private http: HttpClient, private cdRef: ChangeDetectorRef) {
    afterNextRender(async () => {
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      // --- 1. Vòng lặp "đánh thức" server ---
      do {
        this.serverWakeUpAttemptCount++;
        this._showLoading(`Đang đánh thức server lần ${this.serverWakeUpAttemptCount}...`);
        this.isServerRunning = await this._checkServerStatus();

        if (!this.isServerRunning) {
          await delay(2000); // Nếu thất bại, đợi 2 giây trước khi thử lại
        }
      } while (!this.isServerRunning); // Lặp lại cho đến khi server "thức giấc"

      await this.HubChatSignalR.Init();

      // Đăng ký lắng nghe các luồng sự kiện từ SignalR sau khi server đã sẵn sàng.
      this.HubChatSignalR.messageReceived$
        .pipe(takeUntil(this.destroy$))
        .subscribe(this._onMessageReceived.bind(this));
      this.HubChatSignalR.connectionState$
        .pipe(takeUntil(this.destroy$))
        .subscribe(this._onConnectionStateChange.bind(this));
      this._fetchAndActivateRoom(this.currentRoomId());

      this._hideLoading();

      // --- 2. Yêu cầu nhập username nếu chưa có ---
      if (this.userName() === "") {
        await this._promptForUsername();
      }

      // --- 3. Xử lý khi truy cập qua URL có sẵn roomId ---
      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        this._fetchAndActivateRoom(id);
      }
    });
  }

  ngOnInit(): void {
  }

  /**
   * Được gọi khi component sắp bị phá hủy.
   * Phát tín hiệu để hủy tất cả các subscription đang lắng nghe.
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  // #endregion

  // #region UI Event Handlers

  /**
   * Xử lý sự kiện khi người dùng nhấn nút để ẩn/hiện thanh bên (sidebar).
   */
  onToggleSidebar(): void {
    this.isSidebarExpanded = !this.isSidebarExpanded;
  }

  /**
   * Xử lý sự kiện khi người dùng chọn một phòng chat khác.
   * @param roomId - ID của phòng được chọn.
   */
  onChangeRoom(roomId: string): void {
    // Không làm gì nếu người dùng click vào phòng đang hoạt động
    this._setCurrentRoomId(roomId);
  }

  /**
   * Được gọi mỗi khi người dùng cuộn trong khu vực chat.
   * Cập nhật signal isUserNearBottom theo thời gian thực.
   */
  onChatScroll(): void {
    const isNearBottom = this._checkIfUserIsNearBottom(); // Kiểm tra vị trí và thực hiện tác dụng phụ (xóa đánh dấu)
    this.isUserNearBottom.set(isNearBottom); // Cập nhật signal

    if (isNearBottom) this._clearNewMessageIndicatorForCurrentRoom();
  }

  /**
   * Đọc mã phòng từ clipboard và tham gia phòng đó.
   */
  async onJoinRoom(): Promise<void> {
    try {
      const roomId = await navigator.clipboard.readText();
      if (roomId && roomId.trim() !== '') {
        if (this.currentRoomId() === roomId.trim()) return;

        await this._fetchAndActivateRoom(roomId.trim());
        // _fetchAndActivateRoom đã bao gồm việc set phòng và cập nhật URL
      } else {
        console.warn("Clipboard rỗng hoặc không chứa mã phòng.");
      }
    } catch (err) {
      console.error('Không thể đọc từ clipboard hoặc người dùng từ chối quyền:', err);
    }
  }

  /**
   * Xử lý việc gửi tin nhắn mới.
   * Bao gồm: Cập nhật giao diện tức thì, gọi API, và xử lý lỗi.
   */
  async onSendMessage(): Promise<void> {
    const messageContent = this.newMessage.trim();
    if (messageContent === '') return;

    const message: Message = {
      roomId: this.currentRoomId(),
      userName: this.userName(),
      messageValue: messageContent
    };

    // 1. Xóa ô nhập liệu và cuộn xuống dưới cùng
    this.newMessage = '';
    this._scrollToBottom(true); // Luôn cuộn khi người dùng tự gửi tin nhắn

    // 2. Gửi tin nhắn đến server
    try {
      const result = await lastValueFrom(this.HubChatSignalR.sendMessage(message));
      if (!result.success) {
        console.error("Lỗi khi gửi tin nhắn:", result.message);
      }
    } catch (error) {
      console.error("Gửi tin nhắn thất bại:", error);
    }
  }

  /**
   * Mở hộp thoại để người dùng nhập tên phòng mới.
   * Nếu thành công, gọi API để tạo phòng trên server.
   */
  async onCreateNewRoom(): Promise<void> {
    const dialogRef = this.dialog.open<AddRoomDialog, any, string>(AddRoomDialog, {
      width: 'auto',
      disableClose: true, // Ngăn người dùng đóng dialog bằng cách bấm ra ngoài
    });

    const result = await lastValueFrom(dialogRef.afterClosed());
    if (result) {
      await this._fetchCreateRoomFromServer(result)
    }
  }

  /**
   * Mở hộp thoại xác nhận và tiến hành xóa phòng nếu người dùng đồng ý.
   * @param room - Đối tượng phòng cần xóa.
   */
  async onDeleteRoom(room: Room): Promise<void> {
    // Không cho phép xóa phòng mặc định
    // So sánh trực tiếp với ID của phòng mặc định để đảm bảo an toàn
    if (room.roomId === this.rooms()[0].roomId) return;

    const dialogRef = this.dialog.open(ConfirmDeleteDialog, {
      data: { roomName: room.roomName }
    });

    const result = await lastValueFrom(dialogRef.afterClosed());
    if (result) {
      this._showLoading(`Đang xóa phòng "${room.roomName}"...`);
      try {
        const apiResult = await lastValueFrom(this.HubChatSignalR.leaveRoom(room.roomId));
        if (apiResult.success) {
          this._removeRoomFromClientState(room.roomId);
        } else {
          console.error(`Lỗi khi xóa phòng: ${apiResult.message}`);
          // Gợi ý: Hiển thị thông báo lỗi cho người dùng ở đây
        }
      } catch (error) {
        console.error('Xóa phòng thất bại:', error);
      } finally {
        this._hideLoading();
      }
    }
  }
  /**
   * Xử lý sự kiện khi người dùng muốn đổi tên hiển thị.
   */
  async onUserRename(): Promise<void> { await this._promptForUsername() }


  /**
   * Sao chép mã (ID) của phòng hiện tại vào clipboard của người dùng.
   */
  async onShareRoomCode(): Promise<void> {
    const roomId = this.currentRoomId();
    if (!roomId) {
      console.error("Không có mã phòng để sao chép.");
      return;
    }

    try {
      await navigator.clipboard.writeText(roomId);
      // Gợi ý: Bạn có thể hiển thị một thông báo nhanh (toast/snackbar) ở đây để báo cho người dùng biết đã sao chép thành công.
    } catch (err) {
      console.error('Không thể sao chép mã phòng:', err);
    }
  }

  /**
   * Sao chép đường dẫn đầy đủ (URL) của phòng hiện tại vào clipboard.
   */
  async onShareRoomLink(): Promise<void> {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Không thể sao chép đường dẫn:', err);
    }
  }
  // #endregion

  // #region UI Helpers

  /**
   * Kiểm tra xem một phòng có tin nhắn mới chưa đọc hay không.
   * @param room - Đối tượng phòng cần kiểm tra.
   * @returns `true` nếu phòng có trong danh sách `roomsWithNewMessages`.
   */
  hasUnreadMessages(roomId: string): boolean {
    return this.roomsWithNewMessages().includes(roomId);
  }

  /**
   * Xử lý sự kiện khi người dùng nhấn nút "cuộn xuống tin nhắn mới nhất".
   */
  scrollToLatestMessage(): void {
    this._scrollToBottom(true); // Buộc cuộn xuống dưới cùng
  }

  /**
   * Kiểm tra xem một tin nhắn có phải là tin nhắn hệ thống hay không.
   */
  isSystemMessage(message: Message): boolean {
    return message.userName === "System";
  }
  // #endregion

  // #region Core Business Logic

  /**
   * Lấy thông tin chi tiết của một phòng từ server, sau đó thêm và kích hoạt phòng đó trên client.
   * @param roomId - ID của phòng cần lấy thông tin.
   * @returns Kết quả của việc lấy thông tin phòng.
   */
  private async _fetchAndActivateRoom(roomId: string): Promise<ResultOf<Room>> {
    const result = await this._fetchRoomInfoFromServer(roomId);
    if (result.success && result.item) {
      await this._addAndSubscribeToRoom(result.item);
    }

    return result;
  }

  /**
   * Callback được gọi khi có tin nhắn mới từ SignalR hub.
   */
  private _onMessageReceived(message: Message): void {
    this.messages.update(currentMessages => {
      const roomMessages = currentMessages[message.roomId] ? [...currentMessages[message.roomId]] : [];

      // Thêm tin nhắn mới vào danh sách
      roomMessages.push(message);
      return { ...currentMessages, [message.roomId]: roomMessages };
    });
    const rooms = this.roomsWithNewMessages();

    if (!rooms.includes(message.roomId))
      if (message.roomId !== this.currentRoomId() ||
        (!this._checkIfUserIsNearBottom() && message.roomId === this.currentRoomId())) {
        rooms.push(message.roomId);
        this.roomsWithNewMessages.set(rooms);
        this.cdRef.detectChanges();
      }


    // Tự động cuộn xuống nếu người dùng đang ở gần cuối
    this._scrollToBottom();
  }

  /**
   * Callback được gọi khi trạng thái kết nối SignalR thay đổi.
   * Hiển thị hoặc ẩn overlay loading tương ứng.
   * @param connectionStatus - Trạng thái kết nối mới.
   */
  private _onConnectionStateChange(connectionStatus: ConnectionStatus): void {
    switch (connectionStatus) {
      case ConnectionStatus.Reconnecting:
        this._showLoading("Kết nối socket");
        break;
      case ConnectionStatus.Reconnected:
        this._hideLoading();
        break;
    }
  }

  /**
   * Xóa tất cả trạng thái liên quan đến một phòng trên client.
   */
  private _removeRoomFromClientState(roomId: string): void {
    // 1. Xóa phòng khỏi danh sách chính
    this.rooms.update(currentRooms => currentRooms.filter(r => r.roomId !== roomId));

    // 2. Xóa tin nhắn của phòng đó
    this.messages.update(currentMessages => {
      delete currentMessages[roomId];
      return { ...currentMessages };
    });

    // 3. Xóa khỏi danh sách phòng có tin nhắn mới
    this._clearNewMessageIndicatorForCurrentRoom(roomId);

    // 4. Nếu đang ở phòng bị xóa, chuyển về phòng mặc định
    if (this.currentRoomId() === roomId) this._setCurrentRoomId(this.rooms()[0].roomId);
  }

  /**
   * Thêm hoặc cập nhật một phòng, sau đó đăng ký nhận tin nhắn và đặt nó làm phòng hiện tại.
   */
  private async _addAndSubscribeToRoom(room: Room): Promise<void> {
    // Cập nhật hoặc thêm phòng vào signal `rooms`
    this._updateRoomsSignal(room);
    // Tham gia phòng trên SignalR hub để bắt đầu nhận tin nhắn
    await this._subscribeToRoomNotifications(room.roomId);
    // Đặt phòng này làm phòng đang hoạt động trên giao diện
    this._setCurrentRoomId(room.roomId);
  }

  /**
   * Mở hộp thoại yêu cầu người dùng nhập hoặc thay đổi tên hiển thị.
   */
  private async _promptForUsername(): Promise<void> {
    const dialogRef = this.dialog.open(SetUsernameDialog, {
      width: 'auto',
      disableClose: true, // Ngăn người dùng đóng dialog bằng cách bấm ra ngoài
    });

    const result = await lastValueFrom(dialogRef.afterClosed());
    if (result) {
      this.userName.update(() => result);
    }
  }

  /**
   * Cập nhật signal `rooms` với thông tin phòng mới hoặc đã được cập nhật.
   */
  private _updateRoomsSignal(roomItem: Room): void {
    const roomIndex = this.rooms().findIndex(r => r.roomId === roomItem.roomId);
    if (roomIndex !== -1) {
      // Cập nhật phòng đã có
      this.rooms.update(currentRooms => {
        currentRooms[roomIndex] = roomItem;
        return [...currentRooms];
      });
    } else {
      // Thêm phòng mới
      this.rooms.update(currentRooms => [...currentRooms, roomItem]);
    }
  }

  /**
   * Gửi yêu cầu tham gia một phòng chat qua SignalR.
   */
  private async _subscribeToRoomNotifications(roomId: string): Promise<void> {
    await lastValueFrom(this.HubChatSignalR.joinRoom({ roomId: roomId, userName: this.userName() }));
  }

  /**
   * Kiểm tra trạng thái của server bằng cách thử gọi API lấy thông tin phòng mặc định.
   * Đây là một phương pháp "health check" đơn giản để "đánh thức" server (nếu nó đang ngủ).
   * @returns `true` nếu server phản hồi thành công, ngược lại `false`.
   */
  private async _checkServerStatus(): Promise<boolean> {
    // Sử dụng phòng mặc định để kiểm tra, vì nó luôn tồn tại
    const result = await this._fetchRoomInfoFromServer(this.currentRoomId());
    return result.success;
  }

  /**
   * Hàm trung tâm để thiết lập phòng chat hiện tại.
   * Cập nhật signal, URL, và các trạng thái giao diện liên quan.
   */
  private _setCurrentRoomId(roomId: string): void {
    if (this.currentRoomId() === roomId) return;

    this.currentRoomId.set(roomId);

    // Cập nhật URL trên thanh địa chỉ mà không cần tải lại toàn bộ trang
    this.router.navigate(['/chat', roomId], { replaceUrl: true });
    this._scrollToBottom(true); // Luôn cuộn xuống khi chuyển phòng
    this._clearNewMessageIndicatorForCurrentRoom();
  }

  /**
   * Cuộn khung chat xuống tin nhắn cuối cùng một cách thông minh.
   * Chỉ cuộn khi người dùng đang ở gần cuối, hoặc khi có yêu cầu bắt buộc.
   * @param force - Nếu `true`, sẽ luôn cuộn xuống bất kể vị trí hiện tại.
   */
  private _scrollToBottom(force: boolean = false): void {
    if (force || this.isUserNearBottom()) {
      this._performScrollToBottom();
    }
  }

  /**
   * Kiểm tra xem người dùng có đang ở gần cuối của khu vực chat hay không.
   * Hàm này có tác dụng phụ là xóa đánh dấu tin nhắn mới nếu người dùng ở gần cuối.
   * @returns `true` nếu người dùng ở gần cuối, ngược lại `false`.
   */
  private _checkIfUserIsNearBottom(): boolean {
    const chatArea = this.chatMessagesArea?.nativeElement;
    if (!chatArea) return true;

    // Nếu nội dung không đủ dài để tạo thanh cuộn, thì mặc định là người dùng đang ở cuối.
    if (chatArea.scrollHeight <= chatArea.clientHeight) {
      this._clearNewMessageIndicatorForCurrentRoom();
      return true;
    }

    const threshold = 150; // Ngưỡng pixel
    const isNearBottom = Math.round(chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight) < threshold;

    if (isNearBottom) this._clearNewMessageIndicatorForCurrentRoom();

    return isNearBottom;
  }

  private _performScrollToBottom(): void {
    setTimeout(() => {
      const chatArea = this.chatMessagesArea?.nativeElement;
      if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
    }, 0);
  }

  private _clearNewMessageIndicatorForCurrentRoom(roomId?: string): void {
    this.roomsWithNewMessages.update(rooms => {
      // Lọc ra khỏi danh sách phòng có tin nhắn mới, chỉ phòng hiện tại
      return rooms.filter(room => room !== (roomId ?? this.currentRoomId()));
    })
  }

  // #endregion

  // #region API Calls
  /**
   * Gọi API để lấy thông tin chi tiết của một phòng chat.
   * @param roomId - ID của phòng cần lấy thông tin.
   * @returns Một đối tượng `ResultOf<Room>` chứa thông tin phòng nếu thành công.
   */
  private async _fetchRoomInfoFromServer(roomId: string): Promise<ResultOf<Room>> {
    try {
      const url = `${EXTERNAL_URLS.serverChat}/api/Room/GetInfoRoom?RoomId=${encodeURIComponent(roomId)}`;
      return await lastValueFrom(this.http.get<ResultOf<Room>>(url));
    } catch (err) {
      console.error(`Error fetching info for room ${roomId}:`, err);
      return {
        success: false,
        item: undefined,
        message: (err instanceof Error) ? err.message : 'An unknown error occurred'
      };
    }
  }

  /**
   * Gọi API để tạo một phòng chat mới trên server.
   * @param roomName - Tên của phòng mới cần tạo.
   */
  private async _fetchCreateRoomFromServer(roomName: string): Promise<void> {
    this._showLoading(`Đang tạo phòng "${roomName}"...`);
    try {
      const url = `${EXTERNAL_URLS.serverChat}/api/Room/CreateRoom`;
      // API Controller mong đợi một chuỗi thô (raw string) trong body,
      // không phải một đối tượng JSON. Ta cần đặt header Content-Type cho đúng.
      const result = await lastValueFrom(this.http.post<ResultOf<Room>>(url, `"${roomName}"`, {
        headers: { 'Content-Type': 'application/json' }
      }));

      if (result.success && result.item) {
        // Nếu tạo phòng thành công, thêm phòng mới vào danh sách và chuyển sang phòng đó
        await this._addAndSubscribeToRoom(result.item);
      } else {
        // Có thể hiển thị thông báo lỗi cho người dùng ở đây
        console.error('Failed to create room:', result.message);
      }
    } catch (err) {
      console.error(`Error creating room ${roomName}:`, err);
    } finally {
      this._hideLoading();
    }
  }
  // #endregion

  // #region Loading Overlay Helpers
  /**
   * Hiển thị một lớp phủ (overlay) với hiệu ứng tải và một thông điệp.
   * Được sử dụng để thông báo cho người dùng về các hoạt động chạy nền.
   */
  private _showLoading(message: string = 'Đang tải...') {

    // Nếu đã có overlay, hãy hủy nó đi để tạo cái mới
    if (this.overlayRef)
      this.overlayRef.dispose();

    this.overlayRef = this.overlay.create({
      hasBackdrop: true,
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically()
    });

    // Gắn component spinner của Angular Material vào overlay
    const portal = new ComponentPortal(MatProgressSpinner);
    const spinnerRef = this.overlayRef.attach(portal);
    spinnerRef.instance.diameter = 50;
    spinnerRef.instance.strokeWidth = 5;
    spinnerRef.instance.mode = 'indeterminate';

    const overlayElement = this.overlayRef.overlayElement;

    // Tùy chỉnh style cho overlay để giống với theme VS Code
    overlayElement.style.display = 'flex';
    overlayElement.style.flexDirection = 'column';
    overlayElement.style.alignItems = 'center';
    overlayElement.style.justifyContent = 'center';

    overlayElement.style.background = 'var(--surface-color)';        // Nền tối chuẩn VS Code
    overlayElement.style.border = '1px solid var(--border-color)';    // Viền mảnh tinh tế
    overlayElement.style.borderRadius = 'var(--mdc-dialog-container-shape, 4px)'; // Bo góc 4px cứng cáp
    overlayElement.style.padding = '25px 40px';
    overlayElement.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)'; // Đổ bóng tối sâu hơn cho hợp nền đen

    // Tạo và thêm phần tử văn bản (thông điệp loading)
    const textElement = document.createElement('p');
    textElement.innerText = message;

    textElement.style.marginTop = '16px';
    textElement.style.color = 'var(--text-color)';                   // Màu chữ xám sáng (#d4d4d4)
    textElement.style.fontFamily = 'var(--mat-sys-body-large-font, "Segoe UI", sans-serif)';
    textElement.style.fontSize = '14px';
    textElement.style.fontWeight = '500';
    textElement.style.letterSpacing = '0.5px';

    overlayElement.appendChild(textElement);
  }

  /**
   * Ẩn lớp phủ tải đang được hiển thị.
   */
  private _hideLoading() {
    this.overlayRef?.dispose();
  }
  // #endregion
}