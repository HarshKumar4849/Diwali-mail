"use client";

import { useEffect, useRef, useState, type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ScrollRevealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /**
   * If true, the element renders visible immediately without scroll animation.
   * Useful for above-the-fold content or elements that should never be delayed.
   */
  immediate?: boolean;
  /**
   * Stagger delay in milliseconds (e.g. 50, 100)
   */
  delay?: number;
  /**
   * Visual reveal variant
   */
  variant?: "card" | "section" | "table" | "fade";
  /**
   * IntersectionObserver rootMargin (default: trigger slightly before element enters view)
   */
  rootMargin?: string;
  /**
   * IntersectionObserver threshold (0 to 1)
   */
  threshold?: number;
  className?: string;
}

const variantStyles = {
  card: {
    hidden: "opacity-0 translate-y-5 scale-[0.985]",
    visible: "opacity-100 translate-y-0 scale-100",
    duration: "duration-300",
  },
  section: {
    hidden: "opacity-0 translate-y-6",
    visible: "opacity-100 translate-y-0",
    duration: "duration-350",
  },
  table: {
    hidden: "opacity-0 translate-y-4",
    visible: "opacity-100 translate-y-0",
    duration: "duration-300",
  },
  fade: {
    hidden: "opacity-0 translate-y-2",
    visible: "opacity-100 translate-y-0",
    duration: "duration-250",
  },
};

export function ScrollReveal({
  children,
  immediate = false,
  delay = 0,
  variant = "card",
  rootMargin = "0px 0px -30px 0px",
  threshold = 0.05,
  className,
  style,
  ...props
}: ScrollRevealProps) {
  const [isVisible, setIsVisible] = useState(immediate);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If already marked visible or explicitly immediate, no observer needed
    if (immediate || isVisible) return;

    // Accessibility: instantly show if prefers-reduced-motion is active
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    const el = ref.current;
    if (!el) return;

    // If IntersectionObserver is not supported, reveal immediately
    if (!("IntersectionObserver" in window)) {
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    // Check if element is already within or above the viewport on initial mount
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        root: null,
        rootMargin,
        threshold,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [immediate, isVisible, rootMargin, threshold]);

  const config = variantStyles[variant] || variantStyles.card;

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all ease-[cubic-bezier(0.16,1,0.3,1)]",
        config.duration,
        isVisible ? config.visible : config.hidden,
        className
      )}
      style={{
        ...style,
        ...(delay > 0 && !immediate ? { transitionDelay: `${delay}ms` } : {}),
      }}
      {...props}
    >
      {children}
    </div>
  );
}
