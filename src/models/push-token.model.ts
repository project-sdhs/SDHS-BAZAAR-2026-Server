export type PushTokenPlatform = 'ios' | 'android';

export interface PushToken {
  id: number;
  userId: number;
  platform: PushTokenPlatform;
  token: string;
  orderAlertsEnabled: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
