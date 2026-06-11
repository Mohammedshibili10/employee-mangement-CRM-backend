// Auth middleware.
// TODO: verify the JWT token and protect private routes.

import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
    try {
    const authHeader=req.headers.authorization;
    if(!authHeader){
        return res.status(401).json({message:' Authorization required'});
    }
    const token=authHeader.split(' ')[1];
    if(!token){
        return res.status(401).json({message:' Authorization required'});
    }
   const decoded=jwt.verify(token,process.env.JWT_SECRET);
   req.user=decoded;
    next();
    
    } catch (error) {
        return res.status(401).json({message:'Invalid token',error:error.message});
    }   
   
}
export default {protect:authMiddleware};
