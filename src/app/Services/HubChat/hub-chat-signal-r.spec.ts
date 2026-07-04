import { TestBed } from '@angular/core/testing';

import { HubChatSignalR } from './hub-chat-signal-r';

describe('HubChatSignalR', () => {
  let service: HubChatSignalR;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HubChatSignalR);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
