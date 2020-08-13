const express = require("express");
const app = express();
const session = require("express-session");
const bcrypt = require("bcrypt");
/* For testing purposes */
// const pool = require("./testdb.js");
const request = require("request");
const pool = require("./dbPool.js");

app.engine('html', require('ejs').renderFile);
app.use(express.static("public"));

app.set("view engine", "ejs");

app.use(session({
    secret: "top secret!",
    resave: true,
    saveUninitialized: true
}));

app.use(express.urlencoded({extended: true}));

//----------------------------------------------------------------------------------------------------
//--------------------------------------------routes--------------------------------------------------
//----------------------------------------------------------------------------------------------------
app.get("/", function(req, res) {
    res.render("index.ejs", {"authenticated": (req.session.authenticated ? true : false) });
});

app.get("/flight", async function(req, res) {
    //handle the absense of query parameters
    let departDate = req.query.departDate || "2020-08-17";
    let departLoc = req.query.departLoc || "PHL";
    let arriveLoc = req.query.arriveLoc || "SFO";
    let roundtrip = (typeof req.query.triptype == "undefined")? true : req.query.triptype == "roundtrip";
    let returnDate = req.query.returnDate || "2020-08-19";
    let [filters, filterVariables] = handleFlightFilters(req.query.price, req.query.stops, req.query.times);

    // console.log("get /flight req.query: ", req.query);
    let departRows = await getFlightInfo(departDate, departLoc, arriveLoc, filters, filterVariables);
    let returnRows = [];
    if (roundtrip) {
        returnRows = await getFlightInfo(returnDate, arriveLoc, departLoc, filters, filterVariables);
    }
    
    let itemcount = 0;
    let items;
    let users = await getUserInfo(req.session.username);
    if (users.length > 0) {
        items = await getUnpaidReservation(users[0].id);
        if (items.length > 0) {
            itemcount = items.length;
        }
    }
    
    res.render("flight.ejs", 
    {"authenticated": (req.session.authenticated ? true : false), 
    "departRows": departRows, "returnRows": returnRows, 
    "roundtrip": roundtrip, "departDate": departDate, "returnDate": returnDate, 
    "departLoc": departLoc, "arriveLoc": arriveLoc,
    "price": req.query.price || [], "stops": req.query.stops || [], "times": req.query.times || [], //handle undefined
    "itemcount": req.session.authenticated ? itemcount : 0
    });
});

app.get("/hotel", async function(req, res) {
    // console.log("--------------HOtel Page Get---------------");
    // console.log("---req.query: \n", req.query);
    //handle cart
    let itemcount = 0;
    let items;
    let users = await getUserInfo(req.session.username);
    if (users.length > 0) {
        items = await getUnpaidReservation(users[0].id);
        if (items.length > 0) {
            itemcount = items.length;
        }
    }
    //handle hotel search values
    let city = req.query.city || "Philadelphia";
    let state = req.query.state || "PA";
    let startime = req.query.checkinDate || "2020-08-17";
    let endtime = req.query.checkoutDate || "2020-08-19";
    //handle filter values
    let [filters, filterVariables] = handleHotelFilters(req.query.price, req.query.stars, req.query.amenities);
    //handle card values
    let rows = await getHotelInfo(city, state, filters, filterVariables);
    res.render("hotel.ejs", 
    {"authenticated": (req.session.authenticated ? true : false), "itemcount": req.session.authenticated ? itemcount : 0, 
    "rows": rows, "startime": startime, "endtime": endtime,
    "city": city, "state": state,
    "price": req.query.price || [], "stars": req.query.stars || [], "amenities": req.query.amenities || [], //handle undefined
    });
});

app.get("/contact", function(req, res) {
   res.render("contact.ejs", {"authenticated": (req.session.authenticated ? true : false)});
});

// app.get("/admin", function(req, res) {
//     if ((!req.session.authenticated) || (req.session.type != 0)) {
//         res.render("login");
//     }
//     else {
//         res.render("admin", {"authenticated": (req.session.authenticated ? true : false)});
//     }
// });

// //////////////////////////////////////////////////////////////////////////////////////////////////
// |||||||||||||||||||||||||||||||||||| admin routes ||||||||||||||||||||||||||||||||||||||||||||||||
// \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
app.get("/admin", isAuthenticated, async function(req, res) {
    let data1 = await getFlightReport1();
    let data2 = await getFlightReport2();
    let data3 = await getFlightReport3();
    let data4 = await getFlightReport4();

    let hdata1 = await getHotelsReport1();
    let hdata2 = await getHotelsReport2();

    let data5 = await getUserReport1();

    res.render("admin.ejs", {
        dtm: dtm,
        report1: data1,
        report2: data2,
        report3: data3,
        report4: data4,
        report5: data5,
        hreport1: hdata1,
        hreport2: hdata2,
    });
});

app.get("/admin/users/reports", isAuthenticated, async function (req, res) {
    let data1 = await getUserReport1(),
        data2 = await getUserReport2()
    res.render("admin/users/reports.ejs", {
        report: data1,
        report2: data2.data,
        users: data2.users
    });
});

app.get("/admin/hotels", isAuthenticated, function (req, res) {
    let success,
        message;
    if (typeof (req.session.deleting_h_status) == 'object') {
        success = req.session.deleting_h_status.success,
            message = req.session.deleting_h_status.message;
        delete (req.session.deleting_h_status);
    }
    pool.query("SELECT * FROM hotels", function (err, data) {
        if (err) return console.log(err);
        res.render("admin/hotels/index.ejs", {
            hotels: data,
            success: success,
            message: message
        });
    });
});

app.get("/admin/hotels/add", isAuthenticated, function (req, res) {
    res.render("admin/hotels/add.ejs");
});

app.post("/admin/hotels/add", isAuthenticated, function (req, res) {
    if (!req.body) return res.sendStatus(400);
    pool.query(
        "INSERT INTO hotels SET name=?, street_address=?, city=?, state=?, price=?, stars=?, free_wifi=?, free_parking=?, airport_shuttle=?, swimming_pool=?, fitness_center=?", 
        [req.body.name, req.body.street_address, req.body.city, req.body.state, req.body.price, req.body.stars, req.body.free_wifi, req.body.free_parking, req.body.airport_shuttle, req.body.swimming_pool, req.body.fitness_center,], 
        function (err, data) {
            // console.log('here:', data);
            if (err) {
                req.session.saving_h_status = {
                    success: 0,
                    message: `Errors during saving: ${err}`
                }
            } else {
                // console.log(data.insertId);
                req.session.saving_h_status = {
                    'success': 1,
                    'message': `Hotel #${data.insertId} saved successfully!`
                }
            }
            
            res.redirect(`/admin/hotels/edit/${data.insertId}`)
        }
    );
});

app.get("/admin/hotels/edit/:id", isAuthenticated, function (req, res) {
    let success,
        message;
    if (typeof (req.session.saving_h_status) == 'object') {
        success = req.session.saving_h_status.success,
            message = req.session.saving_h_status.message;
        delete (req.session.saving_h_status);
    }
    pool.query("SELECT * FROM hotels WHERE id=?", [req.params.id], function (err, data) {
        if (err) return console.log(err);
        res.render("admin/hotels/edit.ejs", {
            hotel: data[0],
            success: success,
            message: message
        });
    });
});

app.post("/admin/hotels/edit/:id", isAuthenticated, function (req, res) {
    if (!req.body) return res.sendStatus(400);
    const id = req.params.id;
    pool.query(
        "UPDATE hotels SET name=?, street_address=?, city=?, state=?, price=?, stars=?, free_wifi=?, free_parking=?, airport_shuttle=?, swimming_pool=?, fitness_center=? WHERE id=?", 
        [req.body.name, req.body.street_address, req.body.city, req.body.state, req.body.price, req.body.stars, req.body.free_wifi, req.body.free_parking, req.body.airport_shuttle, req.body.swimming_pool, req.body.fitness_center, id],
        function (err, data) {
            if (err) {
                req.session.saving_h_status = {
                    success: 0,
                    message: `Errors during saving: ${err}`
                }
            } else {
                req.session.saving_h_status = {
                    'success': 1,
                    'message': `Hotel #${id} saved successfully!`
                }
            }
            res.redirect(`/admin/hotels/edit/${id}`)
        }
    );
});

app.get("/admin/hotels/delete/:id", isAuthenticated, function (req, res) {
    pool.query("DELETE FROM hotels WHERE id=?", [req.params.id], function (err, data) {
        if (err) {
            req.session.deleting_h_status = {
                'success': 0,
                'message': `Errors during deleting: ${err}`
            }
        } else {
            req.session.deleting_h_status = {
                'success': 1,
                'message': `Hotel #${req.params.id} deleted successfully!`
            }
        }
        res.redirect(`/admin/hotels`)
    });
});

app.get("/admin/hotels/search/", isAuthenticated, async function (req, res) {
    let keyword = pool.escape(`%${req.query.key}%`);
    if (typeof (req.query.key) == 'string') {
        pool.query(
            `SELECT * FROM hotels WHERE id LIKE ${keyword} OR street_address LIKE ${keyword} OR name LIKE ${keyword}`, function (err, data) {
                if (err) return console.log(err);
                res.render("admin/hotels/search.ejs", {
                    data: data
                });
            });
    } else {
        res.render("admin/hotels/search.ejs", { data: false });
    }
});

app.get("/admin/hotels/reports", isAuthenticated, async function (req, res) {

    let data1 = await getHotelsReport1();
    let data2 = await getHotelsReport2();

    res.render("admin/hotels/reports.ejs", {
        dtm: dtm,
        report1: data1,
        report2: data2
    });

});


app.get("/admin/flights", isAuthenticated, function (req, res) {
    let success,
        message;
    if (typeof (req.session.deleting_status) == 'object') {
        success = req.session.deleting_status.success,
        message = req.session.deleting_status.message;
        delete (req.session.deleting_status);
    }
    pool.query("SELECT * FROM flights", function (err, data) {
        if (err) return console.log(err);
        res.render("admin/flights/index.ejs", {
            flights: data,
            dtm: dtm,
            success: success,
            message: message
        });
    });
});

app.get("/admin/flights/add", isAuthenticated, function (req, res) {
    res.render("admin/flights/add.ejs");
});

app.post("/admin/flights/add", isAuthenticated, function (req, res) {
    if (!req.body) return res.sendStatus(400);
    const flight_num = req.body.flight_num,
        airline = req.body.airline,
        departure_timestamp = req.body.departure_timestamp,
        arrival_timestamp = req.body.arrival_timestamp,
        duration = req.body.duration,
        departure_airport = req.body.departure_airport,
        arrival_airport = req.body.arrival_airport,
        layovers = req.body.layovers,
        price = req.body.price;
    pool.query(
        "INSERT INTO flights SET flight_num=?, airline=?, departure_datetime=?, arrival_datetime=?, duration=?, departure_airport=?, arrival_airport=?, layovers=?, price=?",
        [flight_num, airline, departure_timestamp, arrival_timestamp, duration, departure_airport, arrival_airport, layovers, price],
        function (err, data) {
            if (err) {
                req.session.saving_status = {
                    success: 0,
                    message: `Errors during saving: ${err}`
                }
            } else {
                req.session.saving_status = {
                    'success': 1,
                    'message': `Flight #${flight_num} saved successfully!`
                }
            }
            res.redirect(`/admin/flights/edit/${data.insertId}`)
        }
    );
});

app.get("/admin/flights/edit/:id", isAuthenticated, function (req, res) {
    let success,
        message;
    if (typeof (req.session.saving_status) == 'object') {
        success = req.session.saving_status.success,
        message = req.session.saving_status.message;
        delete(req.session.saving_status);
    }
    pool.query("SELECT * FROM flights WHERE id=?", [req.params.id], function (err, data) {
        if (err) return console.log(err);
        res.render("admin/flights/edit.ejs", {
            flight: data[0],
            dtm: dtm,
            success: success,
            message: message
        });
    });
});

app.post("/admin/flights/edit/:id", isAuthenticated, function (req, res) {
    if (!req.body) return res.sendStatus(400);
    const id = req.params.id,
        flight_num = req.body.flight_num,
        airline = req.body.airline,
        departure_timestamp = req.body.departure_timestamp,
        arrival_timestamp = req.body.arrival_timestamp,
        duration = req.body.duration,
        departure_airport = req.body.departure_airport,
        arrival_airport = req.body.arrival_airport,
        layovers = req.body.layovers,
        price = req.body.price;
    pool.query(
        "UPDATE flights SET airline=?, departure_datetime=?, arrival_datetime=?, duration=?, departure_airport=?, arrival_airport=?, layovers=?, price=? WHERE flight_num=?", 
        [airline, departure_timestamp, arrival_timestamp, duration, departure_airport, arrival_airport, layovers, price, flight_num], 
        function (err, data) {
            if (err) {
                req.session.saving_status = {
                    success: 0,
                    message: `Errors during savig: ${err}`
                }
            } else {
                req.session.saving_status = {
                    'success': 1,
                    'message': `Flight #${flight_num} saved successfully!`
                }
            }
            res.redirect(`/admin/flights/edit/${id}`)
        }
    );
});

app.get("/admin/flights/delete/:id", isAuthenticated, function (req, res) {
    pool.query("DELETE FROM flights WHERE flight_num=?", [req.params.id], function (err, data) {
        if (err) {
            req.session.deleting_status = {
                'success': 0,
                'message': `Errors during deleting: ${err}`
            }
        } else {
            req.session.deleting_status = {
                'success': 1,
                'message': `Flight #${req.params.id} deleted successfully!`
            }
        }
        res.redirect(`/admin/flights`)
    });
});

app.get("/admin/flights/search/", isAuthenticated, async function (req, res) {
    let keyword = pool.escape(`%${req.query.key}%`);
    if (typeof (req.query.key) == 'string') {
        pool.query(
            `SELECT * FROM flights WHERE flight_num LIKE ${keyword} OR airline LIKE ${keyword} OR departure_airport LIKE ${keyword} OR arrival_airport LIKE ${keyword}`,
            function (err, data) {
                if (err) return console.log(err);
                res.render("admin/flights/search.ejs", {
                    dtm: dtm,
                    data: data
                });
            });
    } else {
        res.render("admin/flights/search.ejs", { data: false });
    }
});

app.get("/admin/flights/reports", isAuthenticated, async function (req, res) {

    let data1 = await getFlightReport1();
    let data2 = await getFlightReport2();
    let data3 = await getFlightReport3();
    let data4 = await getFlightReport4();

    res.render("admin/flights/reports.ejs", {
        dtm: dtm,
        report1: data1,
        report2: data2,
        report3: data3,
        report4: data4
    });

});

// \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
//   |||||||||||||||||||||||||||||||||||| end admin routes ||||||||||||||||||||||||||||||||||||||||||
// //////////////////////////////////////////////////////////////////////////////////////////////////

app.get("/login", function(req, res) {
   res.render("login.ejs"); 
});

app.post("/login", async function(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    let nextPage = req.body.nextPage || "/"; //from document.referrer when arrived on login page, defaults to index pg
    //console.log("nextPage from signing in will be", nextPage);
    //console.log("req.body.pageURL was ", req.body.pageURL);
    let result = await checkUsername(username);
    // console.dir(result);
    let hashedPwd = "";
    
    if (result.length > 0) {
        if (result[0].type == 1) {
            hashedPwd = result[0].password;
        }
    }
    
    if (await checkPassword(password, hashedPwd)) {
        req.session.authenticated = true;
        req.session.username = username;
        req.session.type = 1;
        if (nextPage == "/login") nextPage = "/";
        res.redirect(nextPage);
    } else {
        res.render("login", {"loginError":true});
    }
});

app.get("/adminlogin", function(req, res) {
    if (req.session.authenticated && (req.session.type == 0)) {
        res.redirect('/admin');
    } else {
        res.render("adminlogin.ejs"); 
    }
});

app.post("/adminlogin", async function(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    
    let result = await checkUsername(username);
    // console.dir(result);
    let hashedPwd = "";
    
    if (result.length > 0) {
        if (result[0].type == 0) {
            hashedPwd = result[0].password;
        }
    }
    
    if (await checkPassword(password, hashedPwd)) {
        req.session.authenticated = true;
        req.session.username = username;
        req.session.type = 0;
        // console.log('loged in');
        res.redirect('/admin');
    } else {
        res.render("adminlogin", {"loginError":true});
    }
});

app.get("/myAccount", isAuthenticated, async function(req, res) {
    let users = await getUserInfo(req.session.username);
    
    let items;
    if (users.length > 0) {
        items = await getReservation(users[0].id);
    }
    res.render("account", {"authenticated": (req.session.authenticated ? true : false), "users":users, "items": items});
});

app.get("/logout", function(req, res) {
    req.session.authenticated = false;
    req.session.username = "";
    req.session.destroy();
    res.redirect("/");
});

app.get("/about", async function(req, res) {
    let imageUrlArray = await getRandomImage("beach", 1);
    
    res.render("about", {"authenticated": (req.session.authenticated ? true : false), "imageUrlArray": imageUrlArray}); 
});

app.get("/covid19", function(req, res) {
   res.render("covid.ejs"); 
});

app.get("/checkout", async function(req, res) {
    // console.log(req.session.type);
    
    if (!req.session.authenticated) {
        res.render("login");
    }
    else {
        let users = await getUserInfo(req.session.username);
        let items;
        let total = 0.00;
        if (users.length > 0) {
            items = await getReservation(users[0].id);
            let rows = await getTotalReservationTotal(users[0].id);
            if (rows.length > 0)  {
                if (rows[0].total!=null) {
                    total = rows[0].total;
                }
                // console.log("Checkouttotal: " + total);
                // console.log(items.length);
            }
        }
        
        res.render("checkout", {"authenticated": (req.session.authenticated ? true : false), "items": items, "total": total}); 
    }
});

app.post("/checkout", async function(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    
    let result = await checkUsername(username);
    // console.dir(result);
    let hashedPwd = "";
    
    if (result.length > 0) {
        if (result[0].type == 1) {
            hashedPwd = result[0].password;
        }
    }
    
    if (await checkPassword(password, hashedPwd)) {
        req.session.authenticated = true;
        req.session.username = username;
        req.session.type = 1;
        
        let users = await getUserInfo(req.session.username);
        let items;
        let total = 0.00;
        if (users.length > 0) {
            items = await getReservation(users[0].id);
            let rows = await getTotalReservationTotal(users[0].id);
            if (rows.length > 0)  {
                if (rows[0].total!=null) {
                    total = rows[0].total;
                }
                // console.log("Checkouttotal: " + total);
                // console.log(items.length);
            }
        }
        
        res.render("checkout", {"authenticated": (req.session.authenticated ? true : false), "items": items, "total": total}); 
    } else {
        res.render("login", {"loginError": true});
    }
});

app.get("/api/getReservation", async function(req, res) {
    let items = await getReservation(req.query.id);
    res.send(items);
});

app.get("/api/getTotalReservationTotal", async function(req, res) {
    let items = await getTotalReservationTotal(req.query.id);
    res.send(items);
});

app.get("/api/removeReservation", async function(req, res) {
    let items = await removeReservation(req.query.id);
    res.send(items);
});

app.get("/api/checkoutReservation", async function(req, res) {
    await checkoutFlightReservation(req.query.id);
    let items = await checkoutHotelReservation(req.query.id);
    res.send(items);
});

app.get("/api/contact", async function(req, res) {
    let sql = "INSERT INTO contact (name, email, message) VALUES (?,?,?)";
    let sqlParams = [req.query.name, req.query.email, req.query.message];
    return new Promise(function(resolve, reject) {
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log(rows);
            resolve(rows.affectedRows.toString());
        });
    });
});

app.get("/api/getUserInfo", async function(req, res) {
    let items = await getUserInfo(req.session.username);
    res.send(items);
});

app.get("/api/updateUserInfo", async function(req, res) {
    let items = await updateUserInfo(req.query.username, req.query.firstname, req.query.lastname, req.query.age, req.query.title, req.query.phone, req.query.email, req.query.address);
    res.send(items);
});

app.post("/api/updateReservation", function(req, res) {
    let action = req.body.action; //"add" or "remove"
    let type = req.body.type; //"flight" or "hotel"
    let start = req.body.start;
    let end = req.body.end;
    let sql = "";
    let sqlParams = [];
    if (action == "add") {
        if (type == "flight") {
            sql = "INSERT INTO `reservations` ( `title`, `user_id`, `type`, `start_datetime`, `end_datetime`, `flight_id`) " +
            'VALUES (?, (SELECT `id` FROM `users` WHERE `username` = ?), ' +
            "0, ?, ?, (SELECT `id` FROM `flights` WHERE `flight_num` = ?))";
            sqlParams.push(req.body.title, req.session.username, start, end, req.body.flightNum);
        } else {
            sql = "INSERT INTO `reservations` (`title`, `start_datetime`, `end_datetime`, `type`, `paid`, `user_id`, `hotel_id`, `flight_id`) " +
            "VALUES (?, ?, ?, ?, ?, (SELECT `id` FROM `users` WHERE `username` = ?), (SELECT `id` FROM `hotels` WHERE `name` = ?), ?)";
            sqlParams.push(req.body.hotel, start, end, 1, null, req.session.username, req.body.hotel, null);
        }
    } else { //REMOVE
        sql = "DELETE FROM `reservations` " +
        'WHERE `user_id` =  (SELECT `user_id` FROM `users` WHERE `username` = ?) ';
        sqlParams.push(req.session.username);
        if (type == "flight") {
            sql += "AND `flight_id` = (SELECT `id` FROM `flights` WHERE `flight_num` = ?)";
            sqlParams.push(req.body.flightNum);
        } else {//hotels
            sql += "AND `hotel_id` = (SELECT `id` FROM `hotels` WHERE `name` = ?) ";
            sqlParams.push(req.body.hotel);
        }
    }
    // console.log("sql: ", sql);
    // console.log("sqlparams: ", sqlParams);
    pool.query(sql, sqlParams, function (err, results, fields) {
       if (err) throw err;
    //   console.log(results); //for debugging purposes
       res.send(results);
    });
});//api/updateReservation

//----------------------------------------------------------------------------------------------------
//--------------------------------------------functions-----------------------------------------------
//----------------------------------------------------------------------------------------------------

// data retrieval for hotels report #1 (count, total, average)
function getHotelsReport1() {
    return new Promise(function (resolve, reject) {
        pool.query("SELECT COUNT(*) as hotels_count, AVG(price) as avg_price, SUM(price) as sum_price FROM hotels", function (error, data) {
            if (error) {
                return reject(error);
            }
            resolve(data[0]);
        });
    });
}

// data retrieval for hotels report #2 (user reservations)
function getHotelsReport2() {
    return new Promise(function (resolve, reject) {
        pool.query(
            "SELECT * FROM reservations JOIN users ON(reservations.user_id = users.id) JOIN hotels ON(reservations.hotel_id = hotels.id) WHERE reservations.hotel_id IS NOT NULL",
            function (error, data) {
                if (error) {
                    return reject(error);
                }
                resolve(data);
            });
    });
}

// data retrieval for flights report #1 (count, total, average)
function getFlightReport1() {
    return new Promise(function (resolve, reject) {
        pool.query("SELECT COUNT(*) as FLIGHTS_COUNT, AVG(price) as AVG_PRICE, SUM(price) as SUM_PRICE FROM flights", function (error, data) {
            if (error) {
                return reject(error);
            }
            resolve(data[0]);
        });
    });
}

// data retrieval for flights report #2 (price by airlines)
function getFlightReport2() {
    return new Promise(function (resolve, reject) {
        pool.query("SELECT airline, SUM(price) as total_price, MIN(price) as min_price, MAX(price) as max_price FROM flights GROUP BY airline", function (error, data) {
            if (error) {
                return reject(error);
            }
            resolve(data);
        });
    });
}

// data retrieval for flights report #3 (price by dep. airport)
function getFlightReport3() {
    return new Promise(function (resolve, reject) {
        pool.query("SELECT departure_airport, SUM(price) as total_price, MIN(price) as min_price, MAX(price) as max_price FROM flights GROUP BY departure_airport", function (error, data) {
            if (error) {
                return reject(error);
            }
            resolve(data);
        });
    });
}

// data retrieval for flights report #4 (user reservations)
function getFlightReport4() {
    return new Promise(function (resolve, reject) {
        pool.query(
            "SELECT * FROM reservations JOIN users ON(reservations.user_id = users.id) JOIN flights ON(reservations.flight_id = flights.id) WHERE reservations.flight_id IS NOT NULL", 
            function (error, data) {
            if (error) {
                return reject(error);
            }
            resolve(data);
        });
    });
}

// data retrieval for users lists - report #1
function getUserReport1() {
    return new Promise(function (resolve, reject) {
        pool.query(
            "SELECT * FROM users",
            function (error, data) {
                if (error) {
                    return reject(error);
                }
                resolve(data);
            });
    });
}

// data retrieval for users report #2
function getUserReport2() {
    return new Promise(function (resolve, reject) {
        pool.query(
            `SELECT users.id, users.firstname, users.lastname, users.username, r.paid, r.type, f.id as fid, f.price as fprice, h.id as hid, h.price as hprice,
            SUM(r.paid) as sum_paid, SUM(f.price) as sum_price1,  SUM(h.price) as sum_price2, CONCAT(users.id, "-", r.type) as ut
            FROM users
            LEFT JOIN reservations as r ON(r.user_id = users.id)
            LEFT JOIN flights as f ON (r.flight_id = f.id)
            LEFT JOIN hotels as h ON (r.hotel_id = h.id)
            GROUP BY ut
           `, 
            function (error, data) {
                if (error) {
                    return reject(error);
                }
                let users = [];
                data.forEach(el => {
                    // console.log(typeof (users[el.username]) == 'undefined');
                    if (typeof(users[el.username]) == 'undefined') {
                        users[el.username] = [];
                        users[el.username].push(el);
                    } else {
                        users[el.username].push(el);
                    }
                });
                resolve({data: data, users:users});
            });
    });
}


function getFlightInfo(departDate, departLoc, arriveLoc, filters, filterVariables) {
    // console.log("GETTING FLIGHT INFO!!!!!!!!");
    // console.log("filters:", filters);
    // console.log("filterVariables", filterVariables);
    let sql = "SELECT * FROM flights WHERE DATE(departure_datetime) = ? AND departure_airport = ? AND arrival_airport = ?";
    let sqlParams = [departDate, departLoc, arriveLoc];
    if (filters != undefined && filters.length > 0) {
        sql += filters;
        sqlParams = sqlParams.concat(filterVariables);
    }
    sql += " ORDER BY `price`";
    // console.log("sql: ", sql);
    // console.log("sqlparams: ", sqlParams);
    return new Promise (function(resolve,reject) {
        pool.query(sql, sqlParams, function (err, rows, fields) {
           if (err) throw err;
        //   console.log(rows); //for debugging purposes
           resolve(rows);
        });//query
    });//promise
}//getFlightInfo

function getHotelInfo(location_city, location_state, filters, filterVariables) {
    // console.log("GETTING HOTEL INFO!!!!!!!!");
    // console.log("filters:", filters);
    // console.log("filterVariables", filterVariables);
    let sql = "SELECT id, name, street_address, city, state, " + 
    "FORMAT(price, 2) AS price, stars, free_wifi, free_parking, airport_shuttle, " + 
    "swimming_pool, fitness_center FROM hotels WHERE city = ? AND state = ?";
    let sqlParams = [location_city, location_state];
    if (filters != undefined && filters.length > 0) {
        sql += filters;
        sqlParams = sqlParams.concat(filterVariables);
    }
    // console.log("sql: ", sql);
    // console.log("sqlparams: ", sqlParams);
    return new Promise (function(resolve,reject) {
        pool.query(sql, sqlParams, function (err, rows, fields) {
           if (err) throw err;
        //   console.log(rows); //for debugging purposes
           resolve(rows);
        });//query
    });//promise
}//getHotelInfo

const dtm = (timestamp) => {  // javascript to mysql datetime convert
    let date = new Date(timestamp);
    return date.getFullYear() + '-' +
        ('00' + (date.getMonth() + 1)).slice(-2) + '-' + ('00' + date.getDate()).slice(-2) + ' ' +
        ('00' + date.getHours()).slice(-2) + ':' + ('00' + date.getMinutes()).slice(-2); 
} 

function checkPassword(password, hashedValue) {
    return new Promise(function(resolve, reject) {
        bcrypt.compare(password, hashedValue, function(err, result) {
            // console.log("Result: " + result);
            resolve(result);
        })
    })
}

function isAuthenticated(req, res, next) {
    if (!req.session.authenticated) {
        res.redirect("/");
    } else {
        next();
    }
}

function isAuthenticatedandAdmin(req, res, next) {
    if (!req.session.authenticated) {
        res.redirect("/");
    } else {
        next();
    }
}

function checkUsername(username) {
    return new Promise(function(resolve, reject) {
        let sql = "SELECT * FROM users WHERE username = ?";
        let sqlParams = [username];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log("UserName Rows found: " + rows.length);
            resolve(rows);
        });
    });
}

function getUserInfo(username) {
    return new Promise(function(resolve, reject) {
        let sql = "SELECT * FROM users WHERE username = ? ";
        let sqlParams = [username];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log("UserName Rows found: " + rows.length);
            resolve(rows);
        });
    });
}

function updateUserInfo(username, firstname, lastname, age, title, phone, email, address) {
    return new Promise(function(resolve, reject) {
        let sql = "UPDATE users SET firstname=?, lastname=?, age=?, title=?, phone=?, email=?, address=? WHERE username=?";
        let sqlParams = [firstname, lastname, age, title, phone, email, address, username];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log(rows);
            resolve(rows.affectedRows.toString());
        });
    });
}

function checkoutFlightReservation(id) {
    return new Promise(function(resolve, reject) {
        let sql = "UPDATE reservations SET paid=(SELECT flights.price FROM flights WHERE flights.id = reservations.flight_id) WHERE user_id=? and type=0";
        let sqlParams = [id];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log("checkoutFlightReservation: " + rows.affectedRows.toString());
            resolve(rows.affectedRows.toString());
        });
    });
}

function checkoutHotelReservation(id) {
    return new Promise(function(resolve, reject) {
        let sql = "UPDATE reservations SET paid=(SELECT hotels.price FROM hotels WHERE hotels.id = reservations.hotel_id) WHERE user_id=? and type=1";
        let sqlParams = [id];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log("checkoutHotelReservation: " + rows.affectedRows.toString());
            resolve(rows.affectedRows.toString());
        });
    });
}

function getReservation(userId) {
    // console.log("getReservation: " + userId)
    return new Promise(function(resolve, reject) {
        let sql = 
        "select r.*, f.price from reservations r " +
        "inner join users u on r.user_id = u.id " +
        "inner join flights f on r.flight_id = f.id " +
        "where u.id = ? " +
        "union all " +
        "select r.*, h.price from reservations r " +
        "inner join users u on r.user_id = u.id " +
        "inner join hotels h on r.hotel_id = h.id " +
        "where u.id = ?";
        let sqlParams = [userId, userId];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log(rows);
            resolve(rows);
        });
    });
}

function getUnpaidReservation(userId) {
    // console.log("getUnpaidReservation: " + userId)
    return new Promise(function(resolve, reject) {
        let sql = 
        "select r.*, f.price from reservations r " +
        "inner join users u on r.user_id = u.id " +
        "inner join flights f on r.flight_id = f.id " +
        "where (u.id = ?) and (r.paid IS NULL)" +
        "union all " +
        "select r.*, h.price from reservations r " +
        "inner join users u on r.user_id = u.id " +
        "inner join hotels h on r.hotel_id = h.id " +
        "where (u.id = ?) and (r.paid IS NULL)";
        let sqlParams = [userId, userId];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log(rows);
            resolve(rows);
        });
    });
}

function addReservation(title, starttime, endtime, type, paid, user_id) {
    return new Promise (function (resolve, reject) {
        let sql = "INSERT INTO reservations (title, start_datetime, end_datetime, type, paid, user_id) VALUES (?,?,?,?,?,?)";
        let sqlParams = [title, starttime, endtime, type, paid, user_id];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log("addReservation");
            resolve(rows.affectedRows.toString());
        });
    });
}

function removeReservation(id) {
    return new Promise (function (resolve, reject) {
        let sql = "DELETE FROM reservations WHERE id = ?";
        let sqlParams = [id];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log("removeReservation");
            resolve(rows.affectedRows.toString());
        });
    });
}

function getTotalReservationTotal(id) {
    return new Promise(function(resolve, reject) {
        let sql =
        "select sum(total) AS total " +
        "from " +
        "( " +
        "   select sum(price) AS total from flights f " +
        "   inner join reservations r on (f.id = r.flight_id) " +
        "   inner join users u on r.user_id = u.id " +
        "   where u.id = ? and (r.paid IS NULL) " +
        "   union all " +
        "   select sum(price) AS total from hotels h " +
        "   inner join reservations r on (h.id = r.hotel_id) " +
        "   inner join users u on r.user_id = u.id " +
        "   where u.id = ? and (r.paid IS NULL)" +
        ") t";
        let sqlParams = [id, id];
        pool.query(sql, sqlParams, function (err, rows, fields) {
            if (err) throw err;
            // console.log(rows);
            resolve(rows);
        });
    });
}

function getRandomImage(keyword, count) {
    return new Promise (function (resolve, reject) {
        let requestUrl = `https://api.unsplash.com/photos/random/?count=${count}&client_id=DFNtOc2PJcHC7Es_occLcK831LGgz4iMZwzMc0P2sp0&featured=true&orientation=landscape&query=${keyword}`;
        request(requestUrl, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                let parsedData = JSON.parse(body);
                
                let imageUrlArray = [];
                for (let i=0; i<count; i++) {
                    imageUrlArray.push(parsedData[i]["urls"]["regular"]);
                }

                resolve(imageUrlArray);
            }
            else {
                // console.log("error:", error);
                // console.log("statusCode:", response && response.statusCode);
                reject(error);
            }
        });
    });
}

///////////////////////////////////////////////////////////////////////////
//------------------------handle flight and hotel filters---------------------------------------------------
//\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
function handleFlightFilters(budget, stops, times) {
    let whereClauseFilters = "";
    let filterVariables = [];
    budget = arrayifyFiltersFromReq(budget);
    stops = arrayifyFiltersFromReq(stops);
    times = arrayifyFiltersFromReq(times);
    [whereClauseFilters, filterVariables] = getBudgetFilters(budget, whereClauseFilters, filterVariables);
    [whereClauseFilters, filterVariables] = getStopFilters(stops, whereClauseFilters, filterVariables);
    [whereClauseFilters, filterVariables] = getTimeFilters(times, whereClauseFilters, filterVariables);
    return [whereClauseFilters, filterVariables];
}

function handleHotelFilters(budget, stars, amenities) {
    let whereClauseFilters = "";
    let filterVariables = [];
    budget = arrayifyFiltersFromReq(budget);
    stars = arrayifyFiltersFromReq(stars);
    amenities = arrayifyFiltersFromReq(amenities);
    [whereClauseFilters, filterVariables] = getBudgetFilters(budget, whereClauseFilters, filterVariables);
    [whereClauseFilters, filterVariables] = getStarsFilters(stars, whereClauseFilters, filterVariables);
    [whereClauseFilters, filterVariables] = getAmenitiesFilters(amenities, whereClauseFilters, filterVariables);
    return [whereClauseFilters, filterVariables];
}

function arrayifyFiltersFromReq(reqQueryFilter) {
    let result;
    if (typeof reqQueryFilter == "undefined") {
        result = [];
    } else if (typeof reqQueryFilter == "object") {
        result = reqQueryFilter;
    } else {
        result = reqQueryFilter.split(",");
    }
    return result;
}

function getBudgetFilters(budget, whereClauseFilters, filterVariables) {
        whereClauseFilters += " AND (";
        filterVariables = [];
        let filter;
        budget.forEach(function(val){
            let rangeString = val;
            let low, high;
            filter = "(price ";
            if (rangeString.slice(-1) == "+") { 
                // console.log("range string when only low is ", rangeString.slice(0,-1));
                low = rangeString.slice(0,-1);
                filter += ">= ?) ";
                filterVariables.push(low);
            } else {
                let lowHigh = rangeString.split("-");
                low = lowHigh[0];
                high = lowHigh[1];
                filter += "BETWEEN ? AND ?) ";
                filterVariables.push(low, high);
            }
            whereClauseFilters += filter + "OR ";
        });//foreach
        if (filterVariables.length == 0) {
            whereClauseFilters = "";
        } else {
            whereClauseFilters = whereClauseFilters.slice(0,-3) + ")"; //remove last "OR "
        }
        return [whereClauseFilters, filterVariables];
    }//getBudgetFilters
    
    function getStopFilters(stops, whereClauseFilters, filterVariables) {
        let inSet = "(";
        stops.forEach(function(val) {
            filterVariables.push(val);
            inSet += "?, ";
        });//foreach
        if (inSet.length > 1) {
            inSet = inSet.slice(0,-2) + ")"; //remove last comma
            whereClauseFilters += ` AND (SUBSTRING(layovers FROM 1 FOR 1) IN ${inSet}) `
        }
        return [whereClauseFilters, filterVariables];
    }
    
    function getStarsFilters(stars, whereClauseFilters, filterVariables) {
        let inSet = "(";
        stars.forEach(function(val) {
            filterVariables.push(val);
            inSet += "?, ";
        });//foreach
        if (inSet.length > 1) {
            inSet = inSet.slice(0,-2) + ")"; //remove last comma
            whereClauseFilters += ` AND stars IN ${inSet} `
        }
        return [whereClauseFilters, filterVariables];
    }
    
    function getTimeFilters(times, whereClauseFilters, filterVariables) {
        whereClauseFilters += " AND (";
        let whereClauseFiltersStartLength = whereClauseFilters.length;
        let filter;
        times.forEach(function(val) {
            switch (val) {
                case "am":
                    filter = '(TIME(departure_datetime) < "12:00:00") ';
                    break;
                case "pm":
                    filter = '(TIME(departure_datetime) > "12:00:00") ';
                    break;
                case "redeye":
                    filter = "(DATE(arrival_datetime) > DATE(departure_datetime)) ";
                    break;
            }
            whereClauseFilters += filter + "OR ";
        });//foreach
        if (whereClauseFilters.length == whereClauseFiltersStartLength) {
            whereClauseFilters = whereClauseFilters.slice(0,-6); //remove " AND ("
        } else {
            whereClauseFilters = whereClauseFilters.slice(0,-3) + ")"; //remove last "OR "
        }
        return [whereClauseFilters, filterVariables];
    }//getTimeFilters
    
    function getAmenitiesFilters(amenities, whereClauseFilters, filterVariables) {
        whereClauseFilters += " AND ";
        let filter;
        amenities.forEach(function(val) {
            switch (val) {
                case "wifi":
                    filter = '`free_wifi` = 1 ';
                    break;
                case "parking":
                    filter = '`free_parking` = 1 ';
                    break;
                case "shuttle":
                    filter = '`airport_shuttle` = 1 ';
                    break;
                case "pool":
                    filter = '`swimming_pool` = 1 ';
                    break;
                case "gym":
                    filter = '`fitness_center` = 1 ';
                    break;
            }
            whereClauseFilters += filter + "AND ";
        });//foreach
        whereClauseFilters = whereClauseFilters.slice(0,-4); //remove last "AND "
        return [whereClauseFilters, filterVariables];
    }//getTimeFilters

//starting server
app.listen(process.env.PORT, process.env.IP, function(){
    console.log("Express server is running...");
});