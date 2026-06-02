import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';

export type UserRole = 'user' | 'senior_dev' | 'admin' | 'po_dev';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  discord_user_id?: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private http = inject(HttpClient);

  userProfile = signal<UserProfile | null>(null);
  private profileSubject = new BehaviorSubject<UserProfile | null>(null);

  constructor() {
    this.loadProfile();
  }

  /**
   * Load current user profile from /api/auth/me
   */
  loadProfile(): Observable<{ user: UserProfile }> {
    return this.http.get<{ user: UserProfile }>('/api/auth/me').pipe(
      tap((response) => {
        this.userProfile.set(response.user);
        this.profileSubject.next(response.user);
      }),
    );
  }

  /**
   * Get user profile as observable
   */
  getProfile$(): Observable<UserProfile | null> {
    return this.profileSubject.asObservable();
  }

  /**
   * Get current user role
   */
  getRole(): UserRole | null {
    return this.userProfile()?.role || null;
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role: UserRole | UserRole[]): boolean {
    const userRole = this.getRole();
    if (!userRole) return false;

    if (Array.isArray(role)) {
      return role.includes(userRole);
    }
    return userRole === role;
  }

  /**
   * Check if user is PO, Developer, or Senior Dev
   */
  isPOOrDeveloper(): boolean {
    const role = this.getRole();
    return role === 'po_dev' || role === 'senior_dev' || role === 'admin';
  }

  /**
   * Check if user is Senior Dev
   */
  isSeniorDev(): boolean {
    const role = this.getRole();
    return role === 'senior_dev' || role === 'admin';
  }

  /**
   * Check if user has Discord linked
   */
  hasDiscordLinked(): boolean {
    return !!this.userProfile()?.discord_user_id;
  }

  /**
   * Link Discord account to user profile
   */
  linkDiscordAccount(discordUserId: string, discordUsername: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>('/api/users/me/discord', {
      discord_user_id: discordUserId,
      discord_username: discordUsername,
    }).pipe(
      tap(() => {
        const profile = this.userProfile();
        if (profile) {
          profile.discord_user_id = discordUserId;
          this.userProfile.set({ ...profile });
          this.profileSubject.next(profile);
        }
      }),
    );
  }

  /**
   * Unlink Discord account
   */
  unlinkDiscordAccount(): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>('/api/users/me/discord').pipe(
      tap(() => {
        const profile = this.userProfile();
        if (profile) {
          delete profile.discord_user_id;
          this.userProfile.set({ ...profile });
          this.profileSubject.next(profile);
        }
      }),
    );
  }
}
