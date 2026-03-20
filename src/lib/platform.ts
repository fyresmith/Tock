type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

export function getNavigatorPlatform(): string {
  const navigatorWithUAData = navigator as NavigatorWithUAData;
  return navigatorWithUAData.userAgentData?.platform ?? navigator.platform ?? "";
}

export function isMacPlatform(): boolean {
  return getNavigatorPlatform().toUpperCase().includes("MAC");
}
