import { useState, useEffect } from 'react';
import { getSubCategoryIcon, loadSubCategoryConfig } from '@/lib/subCategoryConfig';
import type { LucideIcon } from 'lucide-react';

interface SubCategoryIconProps {
  type: string;
  size?: number;
  className?: string;
}

export function SubCategoryIcon({ type, size = 14, className = '' }: SubCategoryIconProps) {
  // Initialize synchronously from cache if already loaded; otherwise MapPin
  const [Icon, setIcon] = useState<LucideIcon>(() => getSubCategoryIcon(type));

  useEffect(() => {
    loadSubCategoryConfig().then(() => {
      setIcon(() => getSubCategoryIcon(type));
    });
  }, [type]);

  return <Icon size={size} className={className} />;
}
