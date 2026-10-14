// verifyToken ke BAAD lagta hai; role DB se aaya hua hota hai.
module.exports = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access only.' });
  }
  next();
};
