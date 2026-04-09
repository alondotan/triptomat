export interface SiteNode {
  site: string;
  site_he?: string;
  site_type: string;
  external_id?: string;
  sub_sites?: SiteNode[];
}

export interface FlatSite {
  label: string;
  path: string[]; // breadcrumb path e.g. ["Cuba", "Havana", "Havana Vieja"]
  siteType: string;
  depth: number;
}
