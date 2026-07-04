import { Injectable, signal, DestroyRef, inject } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { MessageDto } from '../../DTO/message.dto';
import { ReqJoinRoomDto } from '../../DTO/reqJoinRoom.dto';
import { Result } from '../../DTO/result';

@Injectable({
  providedIn: 'root',
})
export class HubChatSignalR {
  private readonly destroyRef = inject(DestroyRef);
  private hubConnection: signalR.HubConnection | null = null;
  private listenersRegistered = false;
  private readonly messageHandlers = new Set<(message: MessageDto) => void>();

  public isConnected = signal<boolean>(false);

  constructor() {
    this.destroyRef.onDestroy(() => {
      void this.stopConnection();
    });
  }

  public async startConnection(): Promise<Result> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      return { Success: false, Message: 'Already connected.' };
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:32768/Hub/Chat', {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.onreconnecting(() => this.isConnected.set(false));
    this.hubConnection.onreconnected(() => this.isConnected.set(true));
    this.hubConnection.onclose(() => this.isConnected.set(false));

    try {
      await this.hubConnection.start();
      this.isConnected.set(true);
      this.registerListeners();
      return { Success: true, Message: 'Connection started successfully.' };
    } catch {
      this.isConnected.set(false);
      return { Success: false, Message: 'Failed to start connection.' };
    }
  }

  public async stopConnection(): Promise<void> {
    if (this.hubConnection) {
      try {
        await this.hubConnection.stop();
      } catch {
        // Ignore shutdown errors.
      }

      this.hubConnection = null;
      this.listenersRegistered = false;
      this.isConnected.set(false);
    }
  }

  public onMessageReceived(callback: (message: MessageDto) => void): () => void {
    this.messageHandlers.add(callback);
    return () => this.messageHandlers.delete(callback);
  }

  public async sendMessage(messageDto: MessageDto): Promise<Result> {
    this.ensureConnected();
    try {
      await this.hubConnection!.invoke('SendMessage', messageDto);
      return { Success: true, Message: 'Message sent successfully.' };
    } catch {
      return { Success: false, Message: 'Failed to send message.' };
    }
  }

  public async joinRoom(reqJoinRoomDto: ReqJoinRoomDto): Promise<Result> {
    this.ensureConnected();
    try {
      await this.hubConnection!.invoke('JoinRoom', reqJoinRoomDto);
      return { Success: true, Message: 'Successfully joined the room.' };
    } catch {
      return { Success: false, Message: 'Failed to join the room.' };
    }
  }

  public async leaveRoom(reqJoinRoomDto: ReqJoinRoomDto): Promise<Result> {
    this.ensureConnected();
    try {
      await this.hubConnection!.invoke('LeaveRoom', reqJoinRoomDto);
      return { Success: true, Message: 'Successfully left the room.' };
    } catch {
      return { Success: false, Message: 'Failed to leave the room.' };
    }
  }

  private registerListeners(): void {
    if (this.listenersRegistered || !this.hubConnection) {
      return;
    }

    this.hubConnection.on('ReceiveMessage', (messageDto: MessageDto) => {
      this.notifyMessageReceived(messageDto);
    });
    this.listenersRegistered = true;
  }

  private notifyMessageReceived(message: MessageDto): void {
    this.messageHandlers.forEach((handler) => handler(message));
  }

  private ensureConnected(): void {
    if (!this.hubConnection || this.hubConnection.state !== signalR.HubConnectionState.Connected) {
      throw new Error('SignalR hub connection is not established.');
    }
  }
}