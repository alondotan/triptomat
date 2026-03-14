import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = 'BGCwNg0bg7gijd1GCWT7APUlVdzAPGSyN-1zZd65ko8ZZaOxOFo2wpwXfCflNLFCs8RxP1oINb0O3eXiU4OwL14';

// Cast to any until push_subscriptions is added to auto-generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Check if push notifications are supported and permission is granted */
export function getPushPermissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/** Request notification permission and subscribe to push */
export async function subscribeToPush(): Promise<boolean> {
  if (getPushPermissionState() === 'unsupported') return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;

  // Check for existing subscription
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisuallyIndicatesInterest: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  // Save to Supabase
  const sub = subscription.toJSON();
  const { error } = await db.from('push_subscriptions').upsert(
    {
      user_id: (await supabase.auth.getUser()).data.user?.id,
      endpoint: sub.endpoint,
      keys: sub.keys,
    },
    { onConflict: 'user_id,endpoint' }
  );

  if (error) {
    console.error('Failed to save push subscription:', error);
    return false;
  }

  return true;
}

/** Unsubscribe from push notifications */
export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    // Remove from DB
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await db.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
    }
  }
}

/** Check if the current browser is subscribed */
export async function isSubscribed(): Promise<boolean> {
  if (getPushPermissionState() !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}
