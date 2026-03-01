export interface SiteNode {
  site: string;
  site_type: string;
  sub_sites?: SiteNode[];
}

export interface LinkedEntity {
  entity_type: 'poi' | 'transportation' | 'contact';
  entity_id: string;
  description: string;
  matched_existing?: boolean;
}
