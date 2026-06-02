import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, UserProfile } from '../shared/services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss'],
})
export class Profile implements OnInit {
  private userService = inject(UserService);

  userProfile: UserProfile | null = null;
  isLoading = false;
  discordLinkingInProgress = false;
  unlinkingInProgress = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  ngOnInit() {
    this.userProfile = this.userService.userProfile();
    this.userService.getProfile$().subscribe((profile) => {
      this.userProfile = profile;
    });
  }

  /**
   * Link Discord account
   */
  linkDiscord() {
    this.errorMessage = null;
    this.successMessage = null;
    this.discordLinkingInProgress = true;

    // In a real scenario, you'd open Discord OAuth flow
    // For now, simulating with a placeholder Discord user ID
    const discordUserId = prompt('Enter your Discord User ID:');

    if (!discordUserId) {
      this.discordLinkingInProgress = false;
      return;
    }

    const discordUsername = prompt('Enter your Discord username:');
    if (!discordUsername) {
      this.discordLinkingInProgress = false;
      return;
    }

    this.userService.linkDiscordAccount(discordUserId, discordUsername).subscribe({
      next: () => {
        this.successMessage = 'Discord account linked successfully!';
        this.discordLinkingInProgress = false;
        setTimeout(() => (this.successMessage = null), 3000);
      },
      error: (err) => {
        this.errorMessage = 'Failed to link Discord account. Please try again.';
        this.discordLinkingInProgress = false;
        console.error(err);
      },
    });
  }

  /**
   * Unlink Discord account
   */
  unlinkDiscord() {
    if (!confirm('Are you sure you want to unlink your Discord account?')) {
      return;
    }

    this.errorMessage = null;
    this.successMessage = null;
    this.unlinkingInProgress = true;

    this.userService.unlinkDiscordAccount().subscribe({
      next: () => {
        this.successMessage = 'Discord account unlinked successfully!';
        this.unlinkingInProgress = false;
        setTimeout(() => (this.successMessage = null), 3000);
      },
      error: (err) => {
        this.errorMessage = 'Failed to unlink Discord account. Please try again.';
        this.unlinkingInProgress = false;
        console.error(err);
      },
    });
  }

  /**
   * Get role display name
   */
  getRoleDisplayName(role: string): string {
    const roleMap: Record<string, string> = {
      user: 'User',
      po_dev: 'Product Owner / Developer',
      senior_dev: 'Senior Developer',
      admin: 'Administrator',
    };
    return roleMap[role] || role;
  }

  /**
   * Check if user can link/unlink Discord
   */
  canManageDiscord(): boolean {
    return this.userService.isPOOrDeveloper();
  }
}
