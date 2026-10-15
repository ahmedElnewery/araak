/** Every user-facing string of the foundation shell. Both locales must provide every key (dictionaries.test.ts). */
export type Dictionary = {
  common: {
    skipToContent: string;
    language: string;
    theme: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
    loading: string;
    retry: string;
    openMenu: string;
    closeMenu: string;
    logoAlt: string;
  };
  errors: {
    notFoundTitle: string;
    notFoundBody: string;
    genericTitle: string;
    genericBody: string;
    forbiddenTitle: string;
    forbiddenBody: string;
    sessionExpiredTitle: string;
    sessionExpiredBody: string;
    suspendedTitle: string;
    suspendedBody: string;
  };
  nav: {
    home: string;
  };
};
