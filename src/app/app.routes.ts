import { Routes } from '@angular/router';

export const routes: Routes = [
    {"path": "", "loadComponent": () => import("./Pages/Home/home").then((m) => m.Home) },
    {"path": "chat", "loadComponent": () => import("./Pages/chat/chat").then((m) => m.Chat) }
];