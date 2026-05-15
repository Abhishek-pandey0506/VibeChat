/**
 * Contacts service — reads the device address book, normalises entries to
 * a flat list of {name, phones, emails} records, and asks for the runtime
 * permission first.
 *
 * On Android we go through PermissionsAndroid for READ_CONTACTS. On iOS
 * react-native-contacts ships its own helper.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import Contacts from 'react-native-contacts';

export interface DeviceContact {
  /** Stable record id (Android: rawContactId, iOS: recordID). */
  id: string;
  displayName: string;
  phones: string[];
  /** Last 10 digits of each phone — matches `users.phoneLast10`. */
  phoneLast10s: string[];
  emails: string[];
  /** Square avatar URL/path if the OS provides one. */
  thumbnail?: string;
}

export async function requestContactsPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      {
        title: 'Find friends on VibeChat',
        message:
          'VibeChat uses your contacts to show which friends are already on ' +
          'VibeChat and to invite the rest.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    return status === PermissionsAndroid.RESULTS.GRANTED;
  }
  // iOS — react-native-contacts has a request helper.
  try {
    const status = await Contacts.requestPermission();
    return status === 'authorized';
  } catch {
    return false;
  }
}

/** Returns true if we already have permission; false if we need to request. */
export async function hasContactsPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
  }
  try {
    const status = await Contacts.checkPermission();
    return status === 'authorized';
  } catch {
    return false;
  }
}

function last10(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Returns the device contacts as flat, deduped records. The caller is
 * responsible for having called requestContactsPermission() beforehand.
 */
export async function getDeviceContacts(): Promise<DeviceContact[]> {
  const raw = await Contacts.getAll();
  const out: DeviceContact[] = [];

  for (const c of raw) {
    const name =
      c.displayName ||
      `${c.givenName ?? ''} ${c.familyName ?? ''}`.trim() ||
      (c.phoneNumbers?.[0]?.number ?? '') ||
      'Unknown';

    const phones = (c.phoneNumbers ?? []).map(p => p.number).filter(Boolean);
    const phoneLast10s = Array.from(
      new Set(phones.map(last10).filter((d): d is string => !!d)),
    );
    const emails = (c.emailAddresses ?? [])
      .map(e => (e.email ?? '').toLowerCase().trim())
      .filter(Boolean);

    // Skip records with neither a phone nor an email — we can't match them
    // against Firebase nor invite them via SMS.
    if (phones.length === 0 && emails.length === 0) continue;

    out.push({
      id: c.recordID || `${name}-${phoneLast10s[0] ?? emails[0]}`,
      displayName: name,
      phones,
      phoneLast10s,
      emails,
      thumbnail: c.thumbnailPath || undefined,
    });
  }

  // Sort by display name (case-insensitive, locale-aware).
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}
