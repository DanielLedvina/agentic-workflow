import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  isAuthenticated = signal(false);
  private authSubject = new BehaviorSubject<boolean>(this.checkAuthStatus());

  constructor() {
    this.checkAuthStatus();
  }

  login(password: string): Observable<any> {
    return this.http.post<any>('/api/auth/login', { password }).pipe(
      tap(() => {
        this.isAuthenticated.set(true);
        this.authSubject.next(true);
      })
    );
  }

  logout(): Observable<any> {
    return this.http.post<any>('/api/auth/logout', {}).pipe(
      tap(() => {
        this.isAuthenticated.set(false);
        this.authSubject.next(false);
        this.router.navigate(['/login']);
      })
    );
  }

  checkAuthStatus(): boolean {
    // Check if session cookie exists by attempting a simple auth check
    // For now, we'll rely on the backend setting httpOnly cookies
    const isAuth = !!localStorage.getItem('auth_token');
    this.isAuthenticated.set(isAuth);
    return isAuth;
  }

  getAuthStatus$(): Observable<boolean> {
    return this.authSubject.asObservable();
  }
}
