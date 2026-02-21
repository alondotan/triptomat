// Source types for the travel data parser

export interface SiteHierarchyNode {
  site: string;
  site_type: string;
  sub_sites?: SiteHierarchyNode[];
}

export interface SourceEmail {
  id: string;
  tripId?: string;
  emailId?: string;
  sourceEmailInfo: {
    subject?: string;
    sender?: string;
    date_sent?: string;
    email_permalink?: string;
    raw_content_cleaned?: string;
  };
  parsedData: {
    metadata?: {
      date?: string;
      category?: string;
      sub_category?: string;
      action?: string;
      order_number?: string;
    };
    sites_hierarchy?: SiteHierarchyNode[];
    accommodation_details?: Record<string, unknown>;
    eatery_details?: Record<string, unknown>;
    attraction_details?: Record<string, unknown>;
    transportation_details?: Record<string, unknown>;
    additional_info?: { summary?: string; raw_notes?: string };
  };
  linkedEntities: Array<{
    entity_type: 'poi' | 'transportation';
    entity_id: string;
    description?: string;
  }>;
  status: 'pending' | 'linked' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface SourceRecommendation {
  id: string;
  tripId?: string;
  recommendationId?: string;
  timestamp?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceImage?: string;
  analysis: {
    main_site?: string;
    sites_list?: Array<{
      site: string;
      site_type: string;
      parent_site?: string;
    }>;
    extracted_items?: Array<{
      name: string;
      category: string;
      sentiment?: 'good' | 'bad';
      paragraph?: string;
      site?: string;
      linked_entity?: {
        entity_type: string;
        entity_id?: string;
      };
    }>;
  };
  linkedEntities: Array<{
    entity_type: 'poi' | 'transportation';
    entity_id: string;
    description?: string;
    matched_existing?: boolean;
  }>;
  status: 'pending' | 'linked';
  createdAt: string;
  updatedAt: string;
}