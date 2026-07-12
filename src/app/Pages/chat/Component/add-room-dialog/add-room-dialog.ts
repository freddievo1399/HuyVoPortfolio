import { Component, inject } from '@angular/core'; // Đã có inject ở đây
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog'; // Thêm MAT_DIALOG_DATA nếu cần nhận data
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-add-room-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDialogModule],
  templateUrl: './add-room-dialog.html',
  styleUrls: ['./add-room-dialog.scss'],
})
export class AddRoomDialog {
  public dialogRef = inject(MatDialogRef<AddRoomDialog>);
  
  private originalData = inject<string>(MAT_DIALOG_DATA);

  public roomName = this.originalData || '';

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    this.dialogRef.close(this.roomName); 
  }
}