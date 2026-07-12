import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'chat/:id',
    renderMode: RenderMode.Client, // Giảm tải cho server bằng cách để trình duyệt của người dùng tự render trang
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender // Dùng Prerender cho các route tĩnh còn lại
  }
];
