import { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verify } from 'hono/jwt';

export const jwtMiddleware: MiddlewareHandler = async (c, next) => {

    // Get the Authorization header from the request
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
        // If the Authorization header is missing, throw a 401 error
        throw new HTTPException(401, { message: 'Authorization header is missing' });
    }

    // Extract the token from the Authorization header
    const token = authHeader.split(' ')[1];
    if (!token) {
        // If the token is missing, throw a 401 error
        throw new HTTPException(401, { message: 'Token is missing' });
    }

    try {
        // Define the secret key used for signing the JWT
        const secret = process.env.JWT_SECRET || 'mySecretKey';

        // Verify the token using the secret key
        const payload = await verify(token, secret);

        // If verification is successful, store the payload in the context
        c.set('jwtPayload', payload); 

        // Call the next middleware or route handler
        await next();


        // If there's an error during verification, log the error and throw a 401 error
    } catch (error) {
        console.error('JWT verification error:', error);
        throw new HTTPException(401, { message: 'Invalid token' });
    }
};
