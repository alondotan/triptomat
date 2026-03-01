interface ContactInfo {
  name?: string[];
  tel?: string[];
  email?: string[];
}

interface ContactsSelectOptions {
  multiple?: boolean;
}

interface ContactsManager {
  select(
    properties: string[],
    options?: ContactsSelectOptions
  ): Promise<ContactInfo[]>;
  getProperties(): Promise<string[]>;
}

interface Navigator {
  contacts?: ContactsManager;
}
