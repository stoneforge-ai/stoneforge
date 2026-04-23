/**
 * Skeleton Component
 *
 * Provides loading placeholder UI with shimmer animation.
 * Used to show content structure while data is loading.
 *
 * Responsive Features:
 * - All skeleton components adapt to mobile/desktop breakpoints
 * - Size variants for different contexts (sm, md, lg)
 * - Touch-friendly sizing on mobile
 */

import { HTMLAttributes, forwardRef } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width of the skeleton (default: '100%') */
  width?: string | number;
  /** Height of the skeleton (default: '1rem') */
  height?: string | number;
  /** Border radius (default: '0.25rem') */
  radius?: string | number;
  /** Show animation (default: true) */
  animate?: boolean;
  /** Variant for common use cases */
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
}

/**
 * Base skeleton with shimmer animation
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      width = '100%',
      height = '1rem',
      radius = '0.25rem',
      animate = true,
      variant,
      className = '',
      style,
      ...props
    },
    ref
  ) => {
    // Determine dimensions based on variant
    let computedWidth = width;
    let computedHeight = height;
    let computedRadius = radius;

    switch (variant) {
      case 'text':
        computedHeight = '1rem';
        computedRadius = '0.25rem';
        break;
      case 'circular':
        computedRadius = '50%';
        break;
      case 'rectangular':
        computedRadius = '0';
        break;
      case 'rounded':
        computedRadius = '0.5rem';
        break;
    }

    const baseClasses = 'bg-gray-200 dark:bg-gray-700';
    const animationClasses = animate
      ? 'animate-pulse'
      : '';

    return (
      <div
        ref={ref}
        className={`${baseClasses} ${animationClasses} ${className}`}
        style={{
          width: typeof computedWidth === 'number' ? `${computedWidth}px` : computedWidth,
          height: typeof computedHeight === 'number' ? `${computedHeight}px` : computedHeight,
          borderRadius: typeof computedRadius === 'number' ? `${computedRadius}px` : computedRadius,
          ...style,
        }}
        data-testid="skeleton"
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

/**
 * Skeleton for text content (single line)
 */
export function SkeletonText({
  width = '100%',
  className = '',
  ...props
}: Omit<SkeletonProps, 'variant' | 'height'>) {
  return (
    <Skeleton
      variant="text"
      width={width}
      className={className}
      {...props}
    />
  );
}

/**
 * Skeleton for avatar/profile images
 */
export function SkeletonAvatar({
  size = 40,
  className = '',
  ...props
}: Omit<SkeletonProps, 'variant' | 'width' | 'height'> & { size?: number }) {
  return (
    <Skeleton
      variant="circular"
      width={size}
      height={size}
      className={className}
      {...props}
    />
  );
}

/**
 * Skeleton for card content - responsive variant
 */
export function SkeletonCard({
  className = '',
  size = 'md',
  ...props
}: Omit<SkeletonProps, 'variant'> & { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: {
      padding: 'p-3',
      gap: 'gap-2',
      avatar: 24,
      spacing: 'space-y-1.5',
    },
    md: {
      padding: 'p-3 sm:p-4',
      gap: 'gap-2 sm:gap-3',
      avatar: 32,
      spacing: 'space-y-1.5 sm:space-y-2',
    },
    lg: {
      padding: 'p-4 sm:p-5',
      gap: 'gap-3 sm:gap-4',
      avatar: 40,
      spacing: 'space-y-2 sm:space-y-3',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div
      className={`${classes.padding} border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}
      data-testid="skeleton-card"
      {...props}
    >
      <div className={`flex items-start ${classes.gap}`}>
        <SkeletonAvatar size={classes.avatar} />
        <div className={`flex-1 ${classes.spacing}`}>
          <SkeletonText width="60%" />
          <SkeletonText width="80%" />
          <SkeletonText width="40%" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for task card - responsive variant
 */
export function SkeletonTaskCard({
  className = '',
  variant = 'desktop',
}: {
  className?: string;
  /** Mobile variant shows card-style, desktop shows list-style */
  variant?: 'mobile' | 'desktop';
}) {
  if (variant === 'mobile') {
    // Mobile card variant - larger touch targets, more padding
    return (
      <div
        className={`p-4 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}
        data-testid="skeleton-task-card"
        data-variant="mobile"
      >
        <div className="flex items-start gap-3">
          <Skeleton width={24} height={24} radius="0.375rem" />
          <div className="flex-1 space-y-3">
            <SkeletonText width="85%" />
            <SkeletonText width="60%" />
            <div className="flex items-center gap-2 flex-wrap">
              <Skeleton width={56} height={22} radius="0.75rem" />
              <Skeleton width={64} height={22} radius="0.75rem" />
              <Skeleton width={48} height={22} radius="0.75rem" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop/default variant
  return (
    <div
      className={`p-2.5 sm:p-3 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}
      data-testid="skeleton-task-card"
      data-variant="desktop"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <Skeleton width={20} height={20} radius="0.25rem" className="flex-shrink-0" />
        <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
          <SkeletonText width="70%" />
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Skeleton width={50} height={18} radius="0.75rem" />
            <Skeleton width={60} height={18} radius="0.75rem" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for table row - responsive variant
 */
export function SkeletonTableRow({
  columns = 4,
  className = '',
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 sm:gap-4 p-2.5 sm:p-3 border-b border-gray-100 dark:border-gray-800 ${className}`}
      data-testid="skeleton-table-row"
    >
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonText
          key={i}
          width={i === 0 ? '30%' : `${20 + Math.random() * 20}%`}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for a list of items - responsive variant
 */
export function SkeletonList({
  count = 5,
  itemHeight,
  mobileItemHeight = 80,
  desktopItemHeight = 60,
  gap,
  mobileGap = 12,
  desktopGap = 8,
  className = '',
  variant = 'auto',
}: {
  count?: number;
  /** Legacy: fixed height for all items (overrides responsive) */
  itemHeight?: number;
  /** Height on mobile (<640px) */
  mobileItemHeight?: number;
  /** Height on desktop (>=640px) */
  desktopItemHeight?: number;
  /** Legacy: fixed gap (overrides responsive) */
  gap?: number;
  /** Gap on mobile */
  mobileGap?: number;
  /** Gap on desktop */
  desktopGap?: number;
  className?: string;
  /** 'auto' uses CSS media queries, 'mobile'/'desktop' force that layout */
  variant?: 'auto' | 'mobile' | 'desktop';
}) {
  // If legacy props are provided, use them directly
  if (itemHeight !== undefined || gap !== undefined) {
    return (
      <div
        className={className}
        style={{ display: 'flex', flexDirection: 'column', gap: `${gap ?? 8}px` }}
        data-testid="skeleton-list"
      >
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton
            key={i}
            height={itemHeight ?? 60}
            radius="0.5rem"
          />
        ))}
      </div>
    );
  }

  // Responsive variant using Tailwind classes
  const gapClass = variant === 'mobile' ? `gap-[${mobileGap}px]` :
                   variant === 'desktop' ? `gap-[${desktopGap}px]` :
                   'gap-3 sm:gap-2'; // gap-3 = 12px, gap-2 = 8px

  return (
    <div
      className={`flex flex-col ${gapClass} ${className}`}
      data-testid="skeleton-list"
      data-variant={variant}
    >
      {Array.from({ length: count }).map((_, i) => {
        const heightClass = variant === 'mobile' ? `h-[${mobileItemHeight}px]` :
                           variant === 'desktop' ? `h-[${desktopItemHeight}px]` :
                           'h-20 sm:h-[60px]'; // h-20 = 80px, h-[60px] = 60px

        return (
          <div
            key={i}
            className={`${heightClass} bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse`}
            data-testid="skeleton-list-item"
          />
        );
      })}
    </div>
  );
}

/**
 * Skeleton for dashboard stat card - responsive variant
 */
export function SkeletonStatCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}
      data-testid="skeleton-stat-card"
    >
      <SkeletonText width="40%" />
      <Skeleton height={28} width="60%" className="mt-1.5 sm:mt-2 sm:h-8" />
      <SkeletonText width="30%" className="mt-1.5 sm:mt-2" />
    </div>
  );
}

/**
 * Skeleton for page content - responsive variant
 */
export function SkeletonPage({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-4 sm:space-y-6 ${className}`} data-testid="skeleton-page">
      {/* Header - stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <Skeleton width="60%" height={28} radius="0.25rem" className="sm:w-[200px] sm:h-8" />
        <Skeleton width="40%" height={36} radius="0.375rem" className="sm:w-[100px] min-h-[40px]" />
      </div>
      {/* Content cards - 2 cols on mobile, 3 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard className="col-span-2 lg:col-span-1" />
      </div>
      {/* List - responsive heights */}
      <SkeletonList count={5} mobileItemHeight={80} desktopItemHeight={60} />
    </div>
  );
}

/**
 * Skeleton for message bubble - responsive variant
 */
export function SkeletonMessageBubble({
  className = '',
  isOwn = false,
}: {
  className?: string;
  isOwn?: boolean;
}) {
  return (
    <div
      className={`flex ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-start gap-2 sm:gap-3 ${className}`}
      data-testid="skeleton-message-bubble"
    >
      <SkeletonAvatar size={32} className="flex-shrink-0 sm:w-10 sm:h-10" />
      <div className={`flex-1 max-w-[80%] sm:max-w-[70%] space-y-1.5 sm:space-y-2 ${isOwn ? 'items-end' : 'items-start'}`}>
        <SkeletonText width="30%" className="h-3 sm:h-4" />
        <div className="p-3 sm:p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
          <SkeletonText width="100%" />
          <SkeletonText width="80%" className="mt-1.5" />
          <SkeletonText width="40%" className="mt-1.5" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for document card - responsive variant
 */
export function SkeletonDocumentCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}
      data-testid="skeleton-document-card"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <Skeleton width={36} height={36} radius="0.5rem" className="flex-shrink-0 sm:w-10 sm:h-10" />
        <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
          <SkeletonText width="70%" />
          <SkeletonText width="50%" className="h-3" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for entity/team card - responsive variant
 */
export function SkeletonEntityCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}
      data-testid="skeleton-entity-card"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <SkeletonAvatar size={40} className="sm:w-12 sm:h-12" />
        <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
          <SkeletonText width="60%" />
          <SkeletonText width="40%" className="h-3" />
        </div>
      </div>
    </div>
  );
}

export default Skeleton;
