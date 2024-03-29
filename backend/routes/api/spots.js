// backend/routes/api/users.js
const express = require('express')
const { Op } = require('sequelize')
const { requireAuth } = require('../../utils/auth');
const { User, Spot, Booking, Review, SpotImage, ReviewImage } = require('../../db/models');
const { check, query, validationResult } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');

const router = express.Router();

const validateSpot = [
    check('address')
        .exists({ checkFalsy: true })
        .isLength({ min: 4 })
        .withMessage('Street address is required'),
    check('city')
        .exists({ checkFalsy: true })
        .isLength({ min: 2 })
        .withMessage('City is required'),
    check('state')
        .exists({ checkFalsy: true })
        .isLength({ min: 2 })
        .withMessage('State is required'),
    check('country')
        .exists({ checkFalsy: true })
        .isLength({ min: 3 })
        .withMessage('Country is required'),
    check('lat')
        .exists({ checkFalsy: true })
        .withMessage('Latitude is required')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be within -90 and 90'),
    check('lng')
        .exists({ checkFalsy: true })
        .withMessage('Longitude is required')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be within -180 and 180'),
    check('name')
        .exists({ checkFalsy: true })
        .withMessage('Name is required')
        .isLength({ max: 49 })
        .withMessage('Name must be less than 50 characters'),
    check('description')
        .exists({ checkFalsy: true })
        .isLength({ min: 3 })
        .withMessage('Description is required'),
    check('price')
        .exists({ checkFalsy: true })
        .isFloat({ gt: 0 })
        .withMessage('Price per day must be a positive number'),

    handleValidationErrors,
];

const validateReview = [
    check('review')
        .exists({ checkFalsy: true })
        .isLength({ min: 1 })
        .withMessage('Review text is required'),
    check('stars')
        .exists({ checkFalsy: true })
        .isInt({ min: 1, max: 5 })
        .withMessage('Stars must be an integer from 1 to 5'),

    handleValidationErrors,
];

const validateSpotQueryParams = [
    check('page')
        .isInt({ min: 1 })
        .optional()
        .withMessage('Page must be greater than or equal to 1'),
    check('size')
        .isFloat({ min: 1 })
        .optional()
        .withMessage('Size must be greater than or equal to 1'),
    check('minLat')
        .isFloat({ min: -90 })
        .optional()
        .withMessage('Minimum latitude is invalid'),
    check('maxLat')
        .isFloat({ max: 90 })
        .optional()
        .withMessage('Maximum latitude is invalid'),
    check('minLng')
        .isFloat({ min: -180 })
        .optional()
        .withMessage('Minimum longitude is invalid'),
    check('maxLng')
        .isFloat({ max: 180 })
        .optional()
        .withMessage('Maximum longitude is invalid'),
    check('minPrice')
        .isInt({ min: 0 })
        .optional()
        .withMessage('Minimum price must be greater than or equal to 0'),
    check('maxPrice')
        .isInt({ min: 0 })
        .optional()
        .withMessage('Maximum price must be greater than or equal to 0'),
    handleValidationErrors
];


const calculateAvgRating = (reviews) => {
    if (!reviews || reviews.length === 0) return null;
    const sum = reviews.reduce((acc, curr) => acc + curr.stars, 0);
    return sum / reviews.length;
};

const calculateReviewlength = (reviews) => {
    if (!reviews || reviews.length === 0) return 0;
    return reviews.length;
};

const getSpotImagePreview = async (spotId) => {
    const spotImgPreview = await SpotImage.findOne({
        where: {
            spotId,
            preview: true
        }
    });
    return spotImgPreview ? spotImgPreview.url : null;
};


//Get all Spots --> URL: /api/spots
router.get('/', validateSpotQueryParams, async (req, res) => {
    let { page, size, minLat, maxLat, minLng, maxLng, minPrice, maxPrice } = req.query;

    page = parseInt(page) || 1;
    size = parseInt(size) || 20;

    if (page > 10) page = 10;
    if (size > 20) size = 20;

    const paginationObj = {
        limit: size,
        offset: size * (page - 1)
    };

    const queryObj = {
        where: {}
    };

    if (minLat && maxLat) {
        queryObj.where.lat = { [Op.between]: [minLat, maxLat] };
    } else {
        if (minLat) queryObj.where.lat = { [Op.gte]: minLat };
        if (maxLat) queryObj.where.lat = { [Op.lte]: maxLat };
    }

    if (minLng && maxLng) {
        queryObj.where.lng = { [Op.between]: [minLng, maxLng] };
    } else {
        if (minLng) queryObj.where.lng = { [Op.gte]: minLng };
        if (maxLng) queryObj.where.lng = { [Op.lte]: maxLng };
    }

    if (minPrice && maxPrice) {
        queryObj.where.price = { [Op.between]: [minPrice, maxPrice] };
    } else {
        if (minPrice) queryObj.where.price = { [Op.gte]: minPrice };
        if (maxPrice) queryObj.where.price = { [Op.lte]: maxPrice };
    }

    const spots = await Spot.findAll({
        include: [{ model: Review }],
        ...paginationObj,
        ...queryObj
    });

    for (let i = 0; i < spots.length; i++) {
        spots[i].avgRating = calculateAvgRating(spots[i].Reviews);
        spots[i].previewImage = await getSpotImagePreview(spots[i].id);
    }

    const resultSpots = spots.map(spot => ({
        id: spot.id,
        ownerId: spot.ownerId,
        address: spot.address,
        city: spot.city,
        state: spot.state,
        country: spot.country,
        lat: spot.lat,
        lng: spot.lng,
        name: spot.name,
        description: spot.description,
        price: spot.price,
        createdAt: spot.createdAt,
        updatedAt: spot.updatedAt,
        avgRating: spot.avgRating,
        previewImage: spot.previewImage
    }));

    return res.json({
        Spots: resultSpots,
        page: parseInt(page),
        size: parseInt(size)
    });
});

//Get all Spots owned by the Current User --> URL: /api/spots/current
router.get('/current', requireAuth, async (req, res) => {
    const spots = await Spot.findAll({
        where: { ownerId: req.user.id },
        include: [{ model: Review }]
    });

    for (let i = 0; i < spots.length; i++) {
        spots[i].avgRating = calculateAvgRating(spots[i].Reviews);
        spots[i].previewImage = await getSpotImagePreview(spots[i].id);
    }

    const resultSpots = spots.map(spot => ({
        id: spot.id,
        ownerId: spot.ownerId,
        address: spot.address,
        city: spot.city,
        state: spot.state,
        country: spot.country,
        lat: spot.lat,
        lng: spot.lng,
        name: spot.name,
        description: spot.description,
        price: spot.price,
        createdAt: spot.createdAt,
        updatedAt: spot.updatedAt,
        avgRating: spot.avgRating,
        previewImage: spot.previewImage
    }));

    return res.json({
        Spots: resultSpots
    });
});

//Get details of a Spot from an id --> URL: /api/spots/:spotId
router.get('/:spotId', async (req, res) => {

    const spotId = parseInt(req.params.spotId)
    const spot = await Spot.findByPk(spotId, {
        include: [
            { model: Review },
            { attributes: ['id', 'url', 'preview'], model: SpotImage },
            { attributes: ['id', 'firstName', 'lastName'], model: User }
        ]
    });

    if (!spot) {
        res.status(404);
        return res.json({ message: "Spot couldn't be found" });
    }

    const resultSpot = {
        id: spot.id,
        ownerId: spot.ownerId,
        address: spot.address,
        city: spot.city,
        state: spot.state,
        country: spot.country,
        lat: spot.lat,
        lng: spot.lng,
        name: spot.name,
        description: spot.description,
        price: spot.price,
        createdAt: spot.createdAt,
        updatedAt: spot.updatedAt,
        numReviews: calculateReviewlength(spot.Reviews),
        avgRating: calculateAvgRating(spot.Reviews),
        SpotImages: spot.SpotImages,
        Owner: spot.User
    };
    return res.json(resultSpot);
});


//Create a Spot --> URL: /api/spots
router.post('/', requireAuth, validateSpot, async (req, res) => {
    const { address, city, state, country, lat, lng, name, description, price } = req.body

    const newSpot = await Spot.create({
        ownerId: req.user.id,
        address,
        city,
        state,
        country,
        lat,
        lng,
        name,
        description,
        price
    });

    res.status(201)
    return res.json(newSpot)
})

//Add an Image to a Spot based on the Spot's id --> URL: /api/spots/:spotId/images
router.post('/:spotId/images', requireAuth, async (req, res, next) => {

    const { url, preview } = req.body;
    const spot = await Spot.findByPk(req.params.spotId)

    if (!spot) {
        res.status(404)
        return res.json({ message: "Spot couldn't be found" })
    }

    if (spot.ownerId !== req.user.id) {
        res.status(403)
        return res.json({ message: "forbidden" });
    }

    let newImage = await SpotImage.create({
        spotId: spot.id,
        url,
        preview
    });

    const result = {
        id: newImage.id,
        url: newImage.url,
        preview: newImage.preview
    }

    return res.json(result)
});

//Edit a Spot --> URL: /api/spots/:spotId
router.put('/:spotId', requireAuth, validateSpot, async (req, res) => {
    const { address, city, state, country, lat, lng, name, description, price } = req.body
    const spotId = parseInt(req.params.spotId)
    const spot = await Spot.findByPk(spotId)

    if (!spot) {
        res.status(404)
        return res.json({ message: "Spot couldn't be found" })
    }

    if (spot.ownerId !== req.user.id) {
        res.status(403)
        return res.json({ message: "forbidden" });
    }

    spot.address = address || spot.address;
    spot.city = city || spot.city;
    spot.state = state || spot.state;
    spot.country = country || spot.country;
    spot.lat = lat || spot.lat;
    spot.lng = lng || spot.lng;
    spot.name = name || spot.name;
    spot.description = description || spot.description;
    spot.price = price || spot.price;

    await spot.save()

    return res.json(spot)
})


//Delete a Spot -->URL: /api/spots/:spotId
router.delete('/:spotId', requireAuth, async (req, res) => {
    const spotId = parseInt(req.params.spotId)
    const spot = await Spot.findByPk(spotId)

    if (!spot) {
        res.status(404)
        return res.json({ message: `Spot couldn't be found` })
    }

    if (spot.ownerId != req.user.id) {
        res.status(403)
        return res.json({ message: "Forbidden" })
    }

    await spot.destroy()

    return res.json({ message: "Successfully deleted" })
})


//Get all Reviews by a Spot's id --> URL: /api/spots/:spotId/reviews
router.get('/:spotId/reviews', async (req, res) => {
    const spot = await Spot.findByPk(req.params.spotId)

    if (!spot) {
        res.status(404)
        return res.json({ message: "Spot couldn't be found" })
    }

    const allreviews = await Review.findAll({
        where: { spotId: req.params.spotId },
        include: [
            {
                model: User,
                attributes: ['id', 'firstName', 'lastName']
            },
            { model: ReviewImage, attributes: ["id", "url"] }
        ]
    })

    return res.json({ Reviews: allreviews })
});

//Create a Review for a Spot based on the Spot's id --> URL: /api/spots/:spotId/reviews
router.post('/:spotId/reviews', requireAuth, validateReview, async (req, res) => {
    const { review, stars } = req.body
    const userId = req.user.id
    const spotId = parseInt(req.params.spotId)

    const spot = await Spot.findByPk(spotId)

    if (!spot) {
        res.status(404)
        return res.json({ message: "Spot couldn't be found" })
    }

    const oldReview = await Review.findOne({
        where: {
            spotId: spotId,
            userId: userId
        }
    })

    if (oldReview) {
        res.status(500)
        return res.json({ message: "User already has a review for this spot" })
    }

    const newReview = await Review.create({
        userId: userId,
        spotId: spotId,
        review: review,
        stars: stars
    })
    newReview.save()

    res.status(201)
    return res.json(newReview)
});


//Get all Bookings for a Spot based on the Spot's id --> URL: /api/spots/:spotId/bookings
router.get('/:spotId/bookings', requireAuth, async (req, res) => {
    const spotId = parseInt(req.params.spotId)

    const spot = await Spot.findByPk(spotId);

    if (!spot) {
        res.status(404)
        return res.json({ message: "Spot couldn't be found" });
    }

    const usersBookings = await Booking.findAll({
        attributes: ['spotId', 'startDate', 'endDate'],
        where: {
            spotId: req.params.spotId,
            userId: req.user.id
        }
    })

    const ownersBooking = await Booking.findAll({
        where: {
            spotId: spot.id
        },
        include: [{
            model: User,
            attributes: ['id', 'firstName', 'lastName']
        }]
    })

    let resultBookings = null;

    if (spot.ownerId === req.user.id) {
        resultBookings = ownersBooking
    }
    if (spot.ownerId !== req.user.id) {
        resultBookings = usersBookings
    }

    return res.json({ Bookings: resultBookings })
});

const validateDates = (req, res, next) => {
    let { startDate, endDate } = req.body;
    let currentDate = new Date();
    const errorResponse = {
        message: "Bad Request",
        errors: {}
    };

    if(!startDate || !endDate){
        errorResponse.errors = {
            startDate: "startDate cannot be in the past",
            endDate: "endDate cannot be on or before startDate"
        };
    }

    startDate = new Date(startDate);
    endDate = new Date(endDate);

    if (startDate < currentDate && endDate <= startDate) {
        errorResponse.errors = {
            startDate: "startDate cannot be in the past",
            endDate: "endDate cannot be on or before startDate"
        };
    } else if (startDate < currentDate) {
        errorResponse.errors.startDate = "startDate cannot be in the past";
    } else if (endDate <= startDate) {
        errorResponse.errors.endDate = "endDate cannot be on or before startDate";
    } else {
        return next();
    }

    return res.status(400).json(errorResponse);
};

//Create a Booking from a Spot based on the Spot's id --> URL: /api/spots/:spotId/bookings
router.post('/:spotId/bookings', requireAuth, validateDates, async (req, res) => {
    let { startDate, endDate } = req.body;
    const spotId = parseInt(req.params.spotId);
    const userId = parseInt(req.user.id);

    const spot = await Spot.findByPk(spotId);

    if (!spot) {
        return res.status(404).json({
            message: "Spot couldn't be found"
        });
    };

    if (spot.ownerId == userId) {
        return res.status(403).json({
            message: "Forbidden"
        });
    };

    const startDateCheck = new Date(startDate);
    const endDateCheck = new Date(endDate);

    const checkBooking = await Booking.findOne({
        where: {
            spotId,
            [Op.and]: [
                {
                    startDate: {
                        [Op.lte]: endDateCheck
                    }
                },
                {
                    endDate: {
                        [Op.gte]: startDateCheck
                    }
                }
            ]
        }
    });

    if (checkBooking) {
        const bookingStart = new Date(checkBooking.startDate);
        const bookingEnd = new Date(checkBooking.endDate);
        const errorResponse = {
            message: "Sorry, this spot is already booked for the specified dates",
            errors: {}
        };

        if (endDateCheck == bookingStart) {
            errorResponse.errors.endDate = "End date conflicts with an existing checkBooking";
        };

        if (startDateCheck >= bookingStart && endDateCheck <= bookingEnd) {
            errorResponse.errors = {
                startDate: "Start date conflicts with an existing checkBooking",
                endDate: "End date conflicts with an existing checkBooking"
            }
        };

        if (startDateCheck >= bookingStart) {
            errorResponse.errors.startDate = "Start date conflicts with an existing checkBooking"
        };

        if (endDateCheck <= bookingEnd) {
            errorResponse.errors.endDate = "End date conflicts with an existing checkBooking"
        };

        if (startDateCheck < bookingStart && endDateCheck > bookingEnd) {
            errorResponse.errors = {
                startDate: "Start date conflicts with an existing checkBooking",
                endDate: "End date conflicts with an existing checkBooking"
            }
        };
        res.status(403)
        return res.json(errorResponse);
    };

    const newBooking = await Booking.create({
        spotId,
        userId,
        startDate,
        endDate
    });

    return res.json(newBooking);
});

module.exports = router;
