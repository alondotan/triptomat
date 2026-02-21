import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { getSubCategoryIcon, loadSubCategoryConfig, type SubCategoryEntry } from '@/lib/subCategoryConfig';
import type { LucideIcon } from 'lucide-react';

interface SubCategoryIconProps {
  type: string;
  size?: number;
  className?: string;
}

export function SubCategoryIcon({ type, size = 14, className = '' }: SubCategoryIconProps) {
  const [Icon, setIcon] = useState<LucideIcon>(MapPin);

  useEffect(() => {
    loadSubCategoryConfig().then(() => {
      setIcon(() => getSubCategoryIcon(type));
    });
  }, [type]);

  return <Icon size={size} className={className} />;
}
