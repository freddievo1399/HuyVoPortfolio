import { InjectionToken } from '@angular/core';
// import { environment } from '../../environments/environment';

export const EXTERNAL_URLS = {
    // Ưu tiên sử dụng URL từ biến môi trường (dành cho Docker).
    // Nếu không có, sẽ dùng URL mặc định (dành cho local dev không Docker).
    serverChat: "https://signalrchat-357x.onrender.com",
};

// Khai báo InjectionToken để có thể DI (Dependency Injection) nếu cần
export const EXTERNAL_URLS_TOKEN = new InjectionToken<typeof EXTERNAL_URLS>('ExternalUrls');
