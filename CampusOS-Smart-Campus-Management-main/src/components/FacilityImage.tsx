import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { getFacilityImage } from '../lib/facilityImages.ts';

interface FacilityImageProps {
  imageKey?: string | null;
  alt: string;
  className?: string;
}

export function FacilityImage({ imageKey, alt, className = '' }: FacilityImageProps) {
  const [failed, setFailed] = useState(false);
  const src = getFacilityImage(imageKey);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F3EFE7] to-[#E5DFD3] text-[#0F2342]/60 dark:from-[#101B2E] dark:to-[#1E2E4A] dark:text-[#F5F2EB]/60 ${className}`}
      >
        <Building2 className="h-8 w-8 mb-1.5" />
        <span className="text-xs font-medium px-3 text-center truncate max-w-full">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
