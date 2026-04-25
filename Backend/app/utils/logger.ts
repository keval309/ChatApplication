import winston from 'winston';
import winstonDailyRotateFile from 'winston-daily-rotate-file';
import colors from 'colors';

colors.setTheme({
	info: 'green',
	warn: 'yellow',
	error: 'red',
	debug: 'blue',
});

export const logger = winston.createLogger({
	level: 'info', // Set log level to 'info'
	format: winston.format.combine(
		winston.format.colorize(), // Apply colorization to log messages
		winston.format.simple()
	), // Use the simple format for logging
	transports: [
		new winston.transports.Console(), // Log to the console
		new winstonDailyRotateFile({
			filename: 'logs/application-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			zippedArchive: true,
			maxSize: '20m',
			maxFiles: '14d',
		}), // Log to a daily rotating file
	],
});

const customFormat = winston.format.printf(({ level, message, timestamp }) => {
	return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

export const fcbPaymentLogger = winston.createLogger({
	level: 'debug',
	format: winston.format.combine(
		winston.format.timestamp({
			format: 'YYYY-MM-DD HH:mm:ss',
		}),
		winston.format.colorize(),
		customFormat
	),
	transports: [
		new winston.transports.Console(),
		new winstonDailyRotateFile({
			filename: 'logs/fcb-payments-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			zippedArchive: true,
			maxSize: '20m',
			maxFiles: '14d',
		}),
	],
});
