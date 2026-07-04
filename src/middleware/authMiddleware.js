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

// Allow only admins through. Must run AFTER `protect` (which sets req.user).
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ message: 'Admin access only' });
};

export default { protect: authMiddleware, adminOnly };
