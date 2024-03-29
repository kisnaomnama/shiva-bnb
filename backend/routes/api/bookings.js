
const express = require('express')
const { requireAuth } = require('../../utils/auth');
const { User, Booking, Spot, Review, SpotImage, ReviewImage } = require('../../db/models');
const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');
const { Op } = require("sequelize");

const router = express.Router()


const getSpotImagesForBookings = async (bookings) => {
    for (let i = 0; i < bookings.length; i++) {
        const booking = bookings[i];
        const spotImgPreview = await SpotImage.findOne({
            where: {
                spotId: booking.Spot.id,
                preview: true
            }
        });

        if (spotImgPreview) {
            booking.Spot.dataValues.previewImage = spotImgPreview.url;
        } else {
            booking.Spot.dataValues.previewImage = null;
        }
    }
};

//Get all of the Current User's Bookings --> URL: /api/bookings/current
router.get('/current', requireAuth, async (req, res) => {
    const allBookings = await Booking.findAll({
        include: {
            model: Spot, attributes: {
                exclude: ['description', 'createdAt', 'updatedAt'],
            }
        },
        where: {
            userId: req.user.id
        }
    });

    await getSpotImagesForBookings(allBookings);
    res.json({ Bookings: allBookings });
})



const validateDatesBookings = (startDate, endDate, currentDate) => {
    const errors = {};
    if (startDate < currentDate && endDate <= startDate) {
        errors.startDate = "startDate cannot be in the past";
        errors.endDate = "endDate cannot be on or before startDate";
    } else if (startDate < currentDate) {
        errors.startDate = "startDate cannot be in the past";
    } else if (endDate <= startDate) {
        errors.endDate = "endDate cannot be on or before startDate";
    }
    return errors;
};


//Edit a Booking --> URL: /api/bookings/:bookingId
router.put('/:bookingId', requireAuth, async (req, res) => {
    let { startDate, endDate } = req.body;
    let currentDate = new Date();
    startDate = new Date(startDate);
    endDate = new Date(endDate);
    const bookingId = parseInt(req.params.bookingId);
    const userId = parseInt(req.user.id);

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
        res.status(403)
        return res.json({
            message: "Booking couldn't be found"
        });
    };

    if (booking.userId !== userId) {
        res.status(403)
        return res.json({
            message: "Forbidden"
        });
    };

    const errors = validateDatesBookings(startDate, endDate, currentDate);
    if (Object.keys(errors).length > 0) {
        return res.status(400).json({
            message: "Bad Request",
            errors: errors
        });
    }

    //check for the past booking date
    const oldBookingEndDate = new Date(booking.endDate)
    if (oldBookingEndDate < currentDate) {
        return res.status(403).json({ message: "Past bookings can't be modified" });
    }

    const checkBooking = await Booking.findOne({
        where: {
            id: { [Op.ne]: bookingId },
            spotId: booking.spotId,
            [Op.and]: [
                {
                    startDate: {
                        [Op.lte]: endDate
                    }
                },
                {
                    endDate: {
                        [Op.gte]: startDate
                    }
                }
            ]
        }
    });

    if (checkBooking) {
        const bookingStart = new Date(checkBooking.startDate)
        const bookingEnd = new Date(checkBooking.endDate)
        const errorResponse = {
            message: "Sorry, this spot is already booked for the specified dates",
            errors: {}
        };

        if (endDate == bookingStart) {
            errorResponse.errors.endDate = "End date conflicts with an existing booking";
        }

        if (startDate >= bookingStart) {
            errorResponse.errors.startDate = "Start date conflicts with an existing booking";
        }

        if (endDate <= bookingEnd) {
            errorResponse.errors.endDate = "End date conflicts with an existing booking";
        }

        if (startDate < bookingStart && endDate > bookingEnd) {
            errorResponse.errors = {
                startDate: "Start date conflicts with an existing booking",
                endDate: "End date conflicts with an existing booking"
            };
        }

        return res.status(403).json(errorResponse);
    }

    booking.startDate = startDate || booking.startDate
    booking.endDate = endDate || booking.endDate

    await booking.save();

    res.json(booking);
});


//Delete a Booking --> URL: /api/bookings/:bookingId
router.delete('/:bookingId', requireAuth, async (req, res) => {
    const bookingId = parseInt(req.params.bookingId);
    const userId = parseInt(req.user.id);

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
        res.status(404)
        return res.json({ message: "Booking couldn't be found" });
    };

    if (booking.userId !== userId) {
        res.status(403)
        return res.json({ message: "Forbidden" });
    };

    const spotId = parseInt(booking.spotId)
    const spot = await Spot.findByPk(spotId);

    const currentDate = new Date();
    const bookingStart = new Date(booking.startDate);
    const bookingEnd = new Date(booking.endDate)

    if (currentDate >= bookingStart && currentDate <= bookingEnd) {
        res.status(403)
        return res.json({ message: "Bookings that have been started can't be deleted" });
    };

    if (booking || spot) {
        await booking.destroy()
        return res.json({ message: "Successfully deleted" });
    };
});

module.exports = router;
