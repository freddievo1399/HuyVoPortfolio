import { InjectionToken } from '@angular/core';

export const EXTERNAL_URLS = {
    serverChat:"https://huyvoportfolio-drf0cwgzf2akbvfs.eastasia-01.azurewebsites.net/",
};

// Khai báo InjectionToken để có thể DI (Dependency Injection) nếu cần
export const EXTERNAL_URLS_TOKEN = new InjectionToken<typeof EXTERNAL_URLS>('ExternalUrls');