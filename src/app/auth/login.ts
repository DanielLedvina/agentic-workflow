import { Component, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../shared/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);

  password = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  login(): void {
    const pwd = this.password().trim();
    if (!pwd) {
      this.error.set('Password is required');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.authService.login(pwd).subscribe({
      next: () => {
        this.router.navigate(['/create']);
      },
      error: (err) => {
        this.error.set('Invalid password. Please try again.');
        this.password.set('');
        this.loading.set(false);
      },
    });
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.login();
    }
  }
}
