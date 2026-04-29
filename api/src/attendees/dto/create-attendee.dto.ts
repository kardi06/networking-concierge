import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAttendeeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  headline!: string;

  @IsString()
  @IsNotEmpty()
  bio!: string;

  @IsString()
  @IsNotEmpty()
  company!: string;

  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  skills!: string[];

  @IsString()
  @IsNotEmpty()
  lookingFor!: string;

  @IsBoolean()
  @IsOptional()
  openToChat: boolean = true;
}
