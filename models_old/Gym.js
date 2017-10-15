'use strict';

// Parse config.
require('dotenv').config();

const Sequelize = require('sequelize');
const utils = require('../inc/utils.js');


/* Readability references. */

const isEmpty = utils.isEmpty;


/* Settings. */

const GYM_LIMIT_PER_QUERY = parseInt(process.env.GYM_LIMIT_PER_QUERY) || 50000;


/* Helpers. */

function prepareQueryOptions(models, options) {
    // Parse options.
    var swLat = options.swLat;
    var swLng = options.swLng;
    var neLat = options.neLat;
    var neLng = options.neLng;
    var oSwLat = options.oSwLat;
    var oSwLng = options.oSwLng;
    var oNeLat = options.oNeLat;
    var oNeLng = options.oNeLng;
    var timestamp = options.timestamp || false;

    // Query options.
    var gym_options = {
        attributes: {},
        limit: GYM_LIMIT_PER_QUERY,
        order: [],
        include: [{
            model: models.Raid,
            required: false,
            as: 'raid'
        }]
    };

    // If no viewport, defaults.
    if (isEmpty(swLat) || isEmpty(swLng) || isEmpty(neLat) || isEmpty(neLng)) {
        return gym_options;
    }

    // After this point, viewport is always defined.
    gym_options.where = {
        latitude: {
            $gte: swLat,
            $lte: neLat
        },
        longitude: {
            $gte: swLng,
            $lte: neLng
        }
    };

    /*
     * If we have a viewport, use distance ordering.
     */

    // Center of viewport.
    var viewport_width = neLng - swLng;
    var viewport_height = neLat - swLat;
    var middle_point_lat = neLat - (viewport_height / 2);
    var middle_point_lng = neLng - (viewport_width / 2);

    gym_options.attributes.include = [
        [
            // Calculate distance from middle point in viewport w/ MySQL.
            Sequelize.literal(`
                3959 *
                acos(cos(radians(` + middle_point_lat + `)) *
                cos(radians(\`latitude\`)) *
                cos(radians(\`longitude\`) -
                radians(` + middle_point_lng + `)) +
                sin(radians(` + middle_point_lat + `)) *
                sin(radians(\`latitude\`)))
                `),
            'distance'
        ]
    ];

    gym_options.order.push(Sequelize.literal('`distance` ASC'));

    // If timestamp is known, only load updated Gyms.
    if (timestamp !== false) {
        // Change POSIX timestamp to UTC time.
        timestamp = new Date(timestamp).getTime();

        gym_options.where.last_scanned = {
            $gt: timestamp
        };

        return gym_options;
    }

    // Send Gyms in view but exclude those within old boundaries.
    if (!isEmpty(oSwLat) && !isEmpty(oSwLng) && !isEmpty(oNeLat) && !isEmpty(oNeLng)) {
        gym_options.where = {
            $and: [
                gym_options.where,
                {
                    $not: {
                        latitude: {
                            $gte: oSwLat,
                            $lte: oNeLat
                        },
                        longitude: {
                            $gte: oSwLng,
                            $lte: oNeLng
                        }
                    }
                }
            ]
        };
    }

    return gym_options;
}


/* Model. */

module.exports = function (sequelize, DataTypes) {
    // Sequelize model definition.
    var Gym = sequelize.define('Gym', {
        gym_id: {
            type: DataTypes.STRING(50),
            primaryKey: true
        },
        team_id: {
            type: 'SMALLINT',
            allowNull: false
        },
        guard_pokemon_id: {
            type: 'SMALLINT',
            allowNull: false
        },
        slots_available: {
            type: 'SMALLINT',
            allowNull: false
        },
        enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false
        },
        latitude: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        longitude: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        total_cp: {
            type: 'SMALLINT',
            allowNull: false
        },
        last_modified: {
            type: DataTypes.DATE,
            allowNull: false
        },
        last_scanned: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        // TODO: These are unnecessary VIRTUAL fields.
        pokemon: {
            type: DataTypes.VIRTUAL,
            defaultValue: [],
            get() {
                return [];
            }
        }
    }, {
        timestamps: false,
        freezeTableName: true,
        tableName: 'gym'
    });

    Gym.associate = function (models) {
        Gym.hasOne(models.Raid, {
            foreignKey: 'gym_id',
            targetKey: 'gym_id',
            as: 'raid'
        });

        Gym.hasMany(models.GymMember, {
            foreignKey: 'gym_id',
            targetKey: 'gym_id',
            as: 'members'
        });
    };


    /* Methods. */

    // Get active Gyms by coords or timestamp.
    Gym.get_gyms = function (swLat, swLng, neLat, neLng, timestamp, oSwLat, oSwLng, oNeLat, oNeLng) {
        // Prepare query.
        const gym_options = prepareQueryOptions(
            sequelize.models, {
                'swLat': swLat,
                'swLng': swLng,
                'neLat': neLat,
                'neLng': neLng,
                'oSwLat': oSwLat,
                'oSwLng': oSwLng,
                'oNeLat': oNeLat,
                'oNeLng': oNeLng,
                'timestamp': timestamp
            });

        // Return promise.
        return Gym.findAll(gym_options);
    };

    // Get single Gym + Pokémon in Gym by ID.
    Gym.get_gym = function (id) {
        const gym_options = {
            attributes: {},
            limit: 1,
            order: [],
            include: [{
                model: models.Raid,
                required: false,
                as: 'raid'
            }]
        };

        // Return promise.
        return Gym.findAll(gym_options);
    };

    return Gym;
};