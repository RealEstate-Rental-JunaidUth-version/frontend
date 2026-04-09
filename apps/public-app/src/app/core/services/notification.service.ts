import { Injectable } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Notification } from '../models/notification.model';
import { API_CONSTANTS } from '../constants/api.constants';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  private stompClient?: Client;

  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();

  private unreadCountSubject = new BehaviorSubject<number>(0);
  unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private http: HttpClient) { }

  /* =========================
     WEBSOCKET
  ========================== */
  connect(userId: number): void {
    if (this.stompClient?.active) return;

    // Construct Broker URL for native WebSocket
    // We bypass SockJS and use the direct /websocket sub-path
    const gatewayUrl = API_CONSTANTS.GATEWAY_URL;

    let brokerURL = "";
    if (gatewayUrl) {
      const wsProtocol = gatewayUrl.startsWith('https') ? 'wss' : 'ws';
      const cleanUrl = gatewayUrl.replace(/^https?:\/\//, '');
      brokerURL = `${wsProtocol}://${cleanUrl}${API_CONSTANTS.ENDPOINTS.NOTIFICATIONS.SOCKET}/websocket`;
    } else {
      // If gatewayUrl is relative or empty, use the current window location
      // This ensures we match the protocol (ws vs wss) and host of the page
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      brokerURL = `${wsProtocol}://${window.location.host}${API_CONSTANTS.ENDPOINTS.NOTIFICATIONS.SOCKET}/websocket`;
    }

    this.stompClient = new Client({
      brokerURL: brokerURL,

      debug: (str) => {
        console.log('STOMP Debug:', str);
      },

      onConnect: () => {
        console.log('STOMP Connected to:', brokerURL);
        this.stompClient?.subscribe(
          `/topic/notifications/${userId}`,
          (message: IMessage) => {
            const notification: Notification = JSON.parse(message.body);
            this.addNotification(notification);
          }
        );
      },

      onStompError: frame => {
        console.error('STOMP error:', frame);
      },

      onWebSocketClose: () => {
        console.log('STOMP WebSocket Connection Closed');
      }
    });

    this.stompClient.activate();
  }

  disconnect(): void {
    if (this.stompClient?.active) {
      this.stompClient.deactivate();
    }
  }

  /* =========================
     HTTP
  ========================== */

  loadNotifications(userId: number): void {
    this.http.get<Notification[]>(
      `${API_CONSTANTS.GATEWAY_URL}${API_CONSTANTS.ENDPOINTS.NOTIFICATIONS.BASE}/user/${userId}`
    ).subscribe(notifs => {
      this.notificationsSubject.next(notifs);
      this.updateUnreadCount(notifs);
      console.log(notifs);
    });
  }

  getUnreadCount(userId: number): void {
    this.http.get<number>(
      `${API_CONSTANTS.GATEWAY_URL}${API_CONSTANTS.ENDPOINTS.NOTIFICATIONS.BASE}/unread/count/${userId}`
    ).subscribe(count => this.unreadCountSubject.next(count));
  }

  getTenantScore(userId: number) {
    return this.http.get(
      `${API_CONSTANTS.GATEWAY_URL}${API_CONSTANTS.ENDPOINTS.RENTAL_AGREEMENT.SCORE(userId)}`
    );
  }

  markAsRead(notificationId: number): void {
    this.http.put(
      `${API_CONSTANTS.GATEWAY_URL}${API_CONSTANTS.ENDPOINTS.NOTIFICATIONS.BASE}/${notificationId}/read`,
      {}
    ).subscribe(() => {
      const updated = this.notificationsSubject.value.map(n =>
        n.id === notificationId ? { ...n, status: 'READ' } : n
      );
      this.notificationsSubject.next(updated);
      this.updateUnreadCount(updated);
    });
  }

  /* =========================
     HELPERS
  ========================== */

  private addNotification(notification: Notification): void {
    const current = this.notificationsSubject.value;
    this.notificationsSubject.next([notification, ...current]);
    this.unreadCountSubject.next(this.unreadCountSubject.value + 1);
  }

  private updateUnreadCount(notifications: Notification[]): void {
    const unread = notifications.filter(n => n.status !== 'READ').length;
    this.unreadCountSubject.next(unread);
  }
}
