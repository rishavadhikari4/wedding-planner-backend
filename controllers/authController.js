const express = require("express");
const passport = require("passport");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require('express-rate-limit');


require("dotenv").config();

const {uploadToCloudinary,deleteFromCloudinary} = require('../config/cloudinaryConfig');
const upload = require('../middleware/multer');
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5,
  message: 'Too many login attempts, try again later'
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many registration attempts, try again later'
});

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

//this is the route to register new user
router.post('/register',registerLimiter,async(req , res)=>{
    const {name, email, password, confirmPassword} = req.body;
    if(password !== confirmPassword){
        return res.status(400).json({message:"Passwords do not match"});
    }
    if(!password || typeof password !== 'string' || password.trim() === ''){
        return res.status(400).json({message:"Password is required and must be a valid string"});
    }
    try{
        const userExist = await User.findOne({email});
        if(userExist){
            return res.status(400).json({message:"User already exists"});
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = new User({
            name,
            email,
            password:hashedPassword
        });
        await newUser.save();

        const token = jwt.sign({
            id:newUser._id,
            name:newUser.name,
            email:newUser.email
        },jwtSecret,
        {expiresIn:"2h"}
    );
    res.json({token});
    }catch(err){
        console.error(err);
        res.status(500).json({message:"Server error"});
    }
});

//this is the route for the normal user login
router.post('/login',loginLimiter,async(req,res)=>{
     const { email, password } = req.body;
    try {
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user._id ,
              email: user.email,
              name: user.name
            },
            jwtSecret,
            { expiresIn: '2h' }
        );

        res.json({token});
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

//this is the route to login the admin
router.post('/adminLogin',loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    try {

        const isAdminPasswordValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD);
        if (email === process.env.ADMIN_EMAIL && isAdminPasswordValid) {
            const token = jwt.sign(
                { email: process.env.ADMIN_EMAIL },
                jwtSecret,
                { expiresIn: '2h' }
            );

            return res.json({ token });
        }

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }


        return res.status(400).json({ message: 'Invalid credentials' });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

//this is to verfiy the user is verifed or not
router.get('/verify', authMiddleware, (req, res) => {
    if (req.user.email === process.env.ADMIN_EMAIL) {
        res.json({ valid: true, user: req.user });
    } else {
        res.json({ valid: false, user: req.user });
    }
});



//this is the route for the Oauth2 verification
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get("/google/callback", passport.authenticate("google", { session: false }), (req, res) => {
  const user = req.user;


  const token = jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    jwtSecret,
    { expiresIn: "2h" }
  );

  res.redirect(`https://wedding-planner-frontend-delta.vercel.app/auth-success?token=${token}`);
});


//this is the route to get the particular user profile
router.get(`/profile`,authMiddleware,async(req,res)=>{
    try{
        const user = await User.findById(req.user.id).select(`-password`);
        if(!user){
            return res.status(404).json({message:`User not found`});
        }
        res.json(user);

    }
    catch(error){
        console.error(error);
        res.status(500).json({message:`Server error`,error});
    }
});

//this is the route to edit the user profile
router.patch('/update-profile', authMiddleware, async (req, res) => {
    try {
        const { name, email } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User Not Found' });
        }

        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email });
            if (emailExists) {
                return res.status(400).json({ message: 'Email already in use by another account' });
            }
            user.email = email;
        }

        if (name) user.name = name;

        await user.save();
        res.json({ message: 'Profile updated successfully', user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

//this is the route to get all the user detail
router.get('/allUsers', authMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

//this is the route to remove the user from the database
router.delete('/:id',authMiddleware,async(req,res)=>{
    try{
        const userId = req.params.id;
        const deletedUserId = User.findByIdAndDelete(userId);
    if(!deletedUserId){
        return res.status(404).json({message:"User Not found"});
    }
    return res.status(200).json({message:"User deleted succesfully"});
    }catch(err){
        console.error("Error deleting the User:",err);
        return res.status(500).json({message:"Internal Server Error"});
    }
});


router.patch('/update-profile-pic', upload.single('image'), authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User Not found" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Please upload an image" });
        }

        if (user.profileImageId) {
            await deleteFromCloudinary(user.profileImageId); 
        }

        const result = await uploadToCloudinary(req.file.buffer);

        user.profileImage = result.secure_url;
        user.profileImageId = result.public_id;

        await user.save();

        res.status(200).json({ message: "Updated profile picture successfully", image: result.secure_url });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;