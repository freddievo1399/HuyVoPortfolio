import { Component } from '@angular/core';
import { NgClass } from "@angular/common";
import { RouterLinkActive, RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [NgClass,RouterModule,RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  // Biến quản lý trạng thái đóng/mở menu trên mobile
  isMenuOpen = false;

  // Hàm đảo ngược trạng thái khi bấm nút hamburger
  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  // Hàm đóng menu khi bấm vào link điều hướng
  closeMenu() {
    this.isMenuOpen = false;
  }
}
