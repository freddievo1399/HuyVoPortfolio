import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { HubConnectionState } from '@microsoft/signalr';
import { Subject, Observable, from, defer } from 'rxjs';
import { Message } from '../../DTO/message.dto';
import { ReqJoinRoom } from '../../DTO/reqJoinRoom.dto';
import { Result, ResultOf } from '../../DTO/result';
import { EXTERNAL_URLS } from '../../Constants/external-urls';

/**
 * Enum đại diện cho các trạng thái kết nối của SignalR.
 */
export enum ConnectionStatus {
  Reconnecting,
  Reconnected,
  Disconnected
}

@Injectable({
  providedIn: 'root'
})
export class HubChatSignalR {
  private hubConnection!: signalR.HubConnection;
  private hubUrl = `${EXTERNAL_URLS.serverChat}/Hub/Chat`; // URL của Hub SignalR

  // Promise để theo dõi trạng thái khởi tạo kết nối.

  // --- Subjects để quản lý các luồng dữ liệu (Streams) ---
  private readonly messageReceivedSubject = new Subject<Message>();
  private readonly connectionStateSubject = new Subject<ConnectionStatus>();

  // --- Observables công khai để các component khác có thể đăng ký ---
  /** Luồng (Observable) phát ra tin nhắn mới khi nhận được từ hub. */
  public readonly messageReceived$: Observable<Message> = this.messageReceivedSubject.asObservable();
  /** Luồng (Observable) phát ra trạng thái kết nối (đang kết nối lại, đã kết nối lại). */
  public readonly connectionState$: Observable<ConnectionStatus> = this.connectionStateSubject.asObservable();

  constructor() {
  }

  /**
   * Đảm bảo kết nối SignalR được khởi tạo và bắt đầu.
   * Phương thức này sẽ thiết lập kết nối và đăng ký các sự kiện hub.
   */
  public async Init(): Promise<void> {
    // Nếu đã có kết nối và không phải là trạng thái 'Disconnected', không cần làm gì cả.
    if (this.hubConnection && this.hubConnection.state !== HubConnectionState.Disconnected) {
      return;
    }
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, signalR.HttpTransportType.WebSockets)
      .withAutomaticReconnect()
      .build();

    // Đăng ký các sự kiện từ hub để phát dữ liệu vào các luồng (Observables)
    this._registerHubEvents();

    try {
      await this.hubConnection.start();
    } catch (err) {
      console.error('Error starting SignalR Hub connection:', err);
      // Ném lỗi ra ngoài để Promise bị reject nếu kết nối thất bại
      throw err;
    }
  }

  /**
   * Đăng ký các trình xử lý sự kiện cho hub connection.
   * Các sự kiện này sẽ phát dữ liệu vào các Subject tương ứng.
   */
  private _registerHubEvents(): void {
    this.hubConnection.on('ReceiveMessage', (message: Message) => {
      this.messageReceivedSubject.next(message);
    });

    this.hubConnection.onreconnecting((error) => {
      console.warn('SignalR is reconnecting...', error);
      this.connectionStateSubject.next(ConnectionStatus.Reconnecting);
    });

    this.hubConnection.onreconnected((connectionId) => {
      this.connectionStateSubject.next(ConnectionStatus.Reconnected);
    });

    this.hubConnection.onclose((error) => {
      console.error('SignalR connection closed.', error);
      this.connectionStateSubject.next(ConnectionStatus.Disconnected);
    });
  }

  /**
   * Gọi phương thức 'JoinRoom' trên hub.
   * @param req - Dữ liệu yêu cầu để tham gia phòng.
   * @returns Một Observable sẽ phát ra kết quả từ hub.
   */
  public joinRoom(req: ReqJoinRoom): Observable<Result> {
    // defer đảm bảo logic async chỉ chạy khi có người subscribe.
    // from chuyển Promise thành Observable.
    return defer(() => from(this.invokeWithConnection<Result>('JoinRoom', req)));
  }

  public leaveRoom(req: string): Observable<Result> {
    return defer(() => from(this.invokeWithConnection<Result>('LeaveRoom', `RoomID:${req}`)));
  }

  public sendMessage(message: Message): Observable<ResultOf<Message>> {
    return defer(() => from(this.invokeWithConnection<ResultOf<Message>>('SendMessage', message)));
  }

  /**
   * Hàm nội bộ để đảm bảo kết nối sẵn sàng trước khi gọi một phương thức trên hub.
   */
  private async invokeWithConnection<T>(methodName: string, ...args: any[]): Promise<T> {
    return this.hubConnection.invoke<T>(methodName, ...args);
  }
}