import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-set-username-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './set-username-dialog.html',
  styleUrls: ['./set-username-dialog.scss'],
})
export class SetUsernameDialog {
  public dialogRef = inject(MatDialogRef<SetUsernameDialog>);
  public userName: string = '';

  onSetUsername(): void {
    if (this.userName.trim()) {
      this.dialogRef.close(this.userName.trim());
    }
  }
}