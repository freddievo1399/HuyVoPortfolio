import { Directive, ElementRef, HostListener, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appTooltip]',
  standalone: true // Nếu dự án của bạn dùng Standalone Component
})
export class TooltipDirective {
  @Input('appTooltip') tooltipText: string = '';
  private tooltipElement: HTMLElement | null = null;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('mouseenter') onMouseEnter() {
    if (!this.tooltipText) return;
    this.showTooltip();
  }

  @HostListener('mouseleave') onMouseLeave() {
    this.hideTooltip();
  }

  private showTooltip() {
    // 1. Tạo thẻ div chứa text mô tả
    this.tooltipElement = this.renderer.createElement('div');
    this.renderer.appendChild(
      this.tooltipElement,
      this.renderer.createText(this.tooltipText)
    );

    // 2. Gắn class SCSS để làm đẹp
    this.renderer.addClass(this.tooltipElement, 'custom-tooltip-box');
    this.renderer.appendChild(document.body, this.tooltipElement);

    // 3. Tính toán vị trí hiển thị ngay phía trên/bên cạnh phần tử được hover
    const hostPos = this.el.nativeElement.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;

    // Đặt vị trí xuất hiện (Ví dụ này mặc định hiện phía trên phần tử)
    const top = hostPos.top + scrollY - 8; // Cách một khoảng nhỏ 8px
    const left = hostPos.left + scrollX + hostPos.width / 2;

    this.renderer.setStyle(this.tooltipElement, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipElement, 'left', `${left}px`);
    
    // Thêm class trigger hiệu ứng hiện hình mượt mà
    setTimeout(() => {
      if (this.tooltipElement) this.renderer.addClass(this.tooltipElement, 'show');
    }, 10);
  }

  private hideTooltip() {
    if (this.tooltipElement) {
      this.renderer.removeChild(document.body, this.tooltipElement);
      this.tooltipElement = null;
    }
  }
}