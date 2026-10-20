import { useWindowDimensions } from 'react-native';
export const breakpoints = { tablet: 768, desktop: 1200 } as const;
export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();
  const isDesktop = width >= breakpoints.desktop;
  const isTablet = width >= breakpoints.tablet && !isDesktop;
  const isMobile = width < breakpoints.tablet;
  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    columns: isMobile || fontScale > 1.4 ? 1 : 2,
    gutter: isMobile ? 20 : isDesktop ? 36 : 28,
    maxContentWidth: isMobile ? 640 : isDesktop ? 1200 : 1100,
  };
}
