import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto, res: Response) {
    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { registroAcademico: dto.registroAcademico },
        ],
      },
    });

    if (exists) throw new BadRequestException('El correo o registro académico ya está en uso');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
    });

    return this.generateTokens(user, res);
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user){console.log("falllot2"); throw new UnauthorizedException('Credenciales incorrectas');} 

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch){console.log("falllot"); throw new UnauthorizedException('Credenciales incorrectas');} 
    return this.generateTokens(user, res);
  }

  async logout(res: Response) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    return res.json({ message: 'Sesión cerrada correctamente' });
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { registroAcademico: dto.registroAcademico, email: dto.email },
    });

    if (!user) throw new BadRequestException('Los datos ingresados son incorrectos');

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  async refreshTokens(userId: number, res: Response) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Acceso denegado');

    return this.generateTokens(user, res);
  }

  private generateTokens(
    user: { id: number; email: string; registroAcademico: string },
    res: Response,
  ) {
    const payload = { sub: user.id, email: user.email, registroAcademico: user.registroAcademico };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'development',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'development',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ message: 'Autenticación exitosa' });
  }
}