import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';

import { AzureTokenValidationService } from '../azure-token-validation';
import { IncomingMessage } from 'http';
import { NestAzureAdJwtValidatorModuleOptions } from '../module-config';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AzureActiveDirectoryGuard implements CanActivate {
  private readonly logger = new Logger(AzureActiveDirectoryGuard.name);
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenValidationService: AzureTokenValidationService,
    private readonly options: NestAzureAdJwtValidatorModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const accessToken = this.parseTokenFromContext(context);
    const [isTokenValid, user, isServiceToken] =
      await this.tokenValidationService.isTokenValid(accessToken);

    // token is not valid exit
    if (!isTokenValid) {
      return false;
    }

    // token is valid, but it is a service token, no roles
    if (isServiceToken) {
      return true;
    }

    // token is valid, and token is a user
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    // no roles and token is valid return success
    if (!roles) {
      return true;
    }

    return this.matchRoles(roles, user.roles);
  }

  private parseTokenFromContext(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const header = this.options.tokenHeader ?? 'authtoken';
    const token = request.headers[header];
    return (!!token ? token.toString() : '').trim().split(' ').pop();
  }

  private matchRoles(roles: string[], usersRoles?: string[]) {
    
    if(!usersRoles) return false;
    
    const userRolesLower = usersRoles.map((key) => key.toLowerCase());
    for (const role of roles) {
      if (userRolesLower.includes(role.toLowerCase())) {
        return true;
      }
    }

    if (this.options.enableDebugLogs) {
      this.logger.warn('403 Permission Denied: User not in routes role.');
    }

    return false;
  }
}
