import { Body, Controller, Headers, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(
    @Body() body: { email?: string; password?: string; phone?: string; cin?: string; nom?: string; isAdult?: boolean },
  ) {
    return this.auth.register({
      email: body.email ?? '',
      password: body.password ?? '',
      phone: body.phone,
      cin: body.cin,
      nom: body.nom,
      isAdult: body.isAdult,
    });
  }

  @Post('login')
  login(@Body() body: { identifier?: string; password?: string }) {
    return this.auth.login(body.identifier ?? '', body.password ?? '');
  }

  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    return this.auth.logout(authorization?.replace(/^Bearer\s+/i, ''));
  }

  @Post('validate')
  validate(@Headers('authorization') authorization?: string) {
    return this.auth.validate(authorization?.replace(/^Bearer\s+/i, ''));
  }

  @Post('change-password')
  changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Session invalide');
    return this.auth.changePassword(token, body.currentPassword ?? '', body.newPassword ?? '');
  }

  @Patch('profile')
  updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { nom?: string; email?: string; phone?: string; cin?: string },
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Session invalide');
    return this.auth.updateProfile(token, body);
  }
}