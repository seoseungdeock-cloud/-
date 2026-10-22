// 폰 연락처에 의뢰인 이름 넣기·지우기 (앱 버전만). 앱이 넣은 연락처(회사 칸 = CALLER_MARK)만 건드립니다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts/legacy';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { CALLER_MARK, callerEntries, phoneDigits, type CallerEntry } from '@/core/caller-names';
import { useApp } from '@/ui/use-app';

const KEY = 'daeryuntalk.callerNames';

export const callerSyncSupported = Platform.OS === 'android' || Platform.OS === 'ios';

export async function callerNamesOn(): Promise<boolean> {
  if (!callerSyncSupported) return false;
  return (await AsyncStorage.getItem(KEY).catch(() => null)) === '1';
}

async function mine(): Promise<Contacts.ExistingContact[]> {
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Company, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name] });
  return data.filter((c) => c.company === CALLER_MARK);
}

/** 켜기·다시 맞추기: 목록대로 넣고, 목록에 없는 앱 연락처는 지움 */
export async function syncCallerNames(entries: CallerEntry[]): Promise<{ ok: boolean; reason?: string; count?: number }> {
  if (!callerSyncSupported) return { ok: false, reason: '앱에서만 쓸 수 있습니다.' };
  const perm = await Contacts.requestPermissionsAsync();
  if (perm.status !== 'granted') return { ok: false, reason: '연락처 권한을 허용해 주세요.' };
  await AsyncStorage.setItem(KEY, '1').catch(() => undefined);
  const existing = await mine();
  const want = new Map(entries.map((e) => [e.digits, e]));
  const seen = new Set<string>();
  for (const c of existing) {
    const d = phoneDigits(c.phoneNumbers?.[0]?.number ?? '');
    const e = want.get(d);
    if (!e || seen.has(d)) {
      await Contacts.removeContactAsync(c.id).catch(() => undefined);
      continue;
    }
    seen.add(d);
    if (c.name !== e.name) await Contacts.updateContactAsync({ id: c.id, contactType: Contacts.ContactTypes.Person, name: e.name, firstName: e.name, company: CALLER_MARK, phoneNumbers: [{ label: 'mobile', number: e.phone }] }).catch(() => undefined);
  }
  for (const e of entries) {
    if (seen.has(e.digits)) continue;
    await Contacts.addContactAsync({ contactType: Contacts.ContactTypes.Person, name: e.name, firstName: e.name, company: CALLER_MARK, phoneNumbers: [{ label: 'mobile', number: e.phone }] } as Contacts.Contact);
  }
  return { ok: true, count: entries.length };
}

/** 끄기: 앱이 넣은 연락처를 모두 지움 */
export async function clearCallerNames(): Promise<void> {
  await AsyncStorage.setItem(KEY, '0').catch(() => undefined);
  if (!callerSyncSupported) return;
  const perm = await Contacts.getPermissionsAsync();
  if (perm.status !== 'granted') return;
  for (const c of await mine()) await Contacts.removeContactAsync(c.id).catch(() => undefined);
}

/** 켜 둔 폰에서는 사건방·의뢰인 번호가 바뀔 때마다 연락처를 다시 맞춤 */
export function useCallerNamesAutoSync() {
  const s = useApp();
  const entries = callerEntries(s.rooms, s.users, s.currentUserId ?? '');
  const key = entries.map((e) => `${e.digits}:${e.name}`).join('|');
  useEffect(() => {
    if (!callerSyncSupported || !s.currentUserId) return;
    let live = true;
    void callerNamesOn().then((on) => {
      if (on && live) void syncCallerNames(entries).catch(() => undefined);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.currentUserId]);
}
