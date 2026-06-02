import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { UserService } from '../services/user.service';

/**
 * Guard that allows only Senior Dev and Admin roles
 */
export const seniorDevGuard: CanActivateFn = (route, state) => {
  const userService = inject(UserService);
  const router = inject(Router);

  if (userService.isSeniorDev()) {
    return true;
  }

  router.navigate(['/'], { queryParams: { returnUrl: state.url } });
  return false;
};
