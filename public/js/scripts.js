/* global $*/
$(document).ready(function() {
    //Global variables------------------------------
    
    //Event Hanlders-------------------------------------
    let addToCartButtons = document.querySelectorAll(".btn-remove");
    $("#success").hide();
    
    addToCartButtons.forEach(btn => btn.addEventListener("click", async (event) => {
        var buttonClicked = event.target;
        buttonClicked.parentElement.parentElement.remove();
    }));
    
    $(".btn-remove").on("click", async function() {
        await removeReservation($(this).val());
        let rows = await getTotalReservationTotal($(this).val());
        
        if (rows.length > 0) {
            if (rows[0].total!=null) {
                $("#reservation-total").html(rows[0].total.toFixed(2));
            }
            else {
                $("#reservation-total").html("0.00");
            }
        }
    });
    
    $("#contact-submit").on("click", function() {
        contact($("#contact-name").val(), $("#contact-email").val(),$("#contact-message").val());
    });
    
    $('form.form-signin button').on("click", function() {
        //console.log("set nextpage");
       $('input[name="nextPage"').attr("value", document.referrer.slice(document.referrer.lastIndexOf("/"))); 
    });

    $("#reservation").on("change", function() {
        // let value =  $("#reservation").val();
        $.ajax({
            method: "post",
            url: "/api/getReservation",
            data: {
            },
            success: function(result, status) {
                
                // $("#reservation-info").html("");
                // let htmlString = "";
                
                // htmlString += "<div class='form-group'><label for='flight_num'>Flight Number: </label><input type='text' class='form-control' id='flight_num' value='" + result[0].flight_num + "' readonly></div>"
                
                // $("#reservation-info").append(htmlString);
            }
        });
    });
    
    $("#update-userinfo").on("click", async function() {
        await updateUserInfo($("#username").val(), $("#firstname").val(), $("#lastname").val(), $("#age").val(), $("#title").val(), $("#phone").val(), $("#email").val(), $("#address").val());
        
        alert("User information for " + $("#username").val() + " is updated.")
    });
    
    $("#checkout-button").on("click", async function() {
        $("#accept-label").removeClass("text-danger");
        if (!$("#accept").is(":checked")) {
            $("#accept-label").addClass("text-danger");
            $("#success").hide();
        }
        else if ($("#sign-text").val() === "") {
            $("#success").hide();
            alert("Please enter your e-signature.")
        }
        else {
            $("#success").show();
            
            let rows = await getUserInfo();
            if (rows.length>0) {
                await checkoutReservation(rows[0].id);
                window.location.reload();
            }
        }
    });
    
    $("#roundtrip").on("click", function() {
        //enable the return date input
        $("#returnDate").prev().show();
        $("#returnDate").show();
    });//roundtrip
    
    $("#oneway").on("click", function() {
        //disable the return date input
        $("#returnDate").prev().hide();
        $("#returnDate").hide();
    });//oneway
    
    $("#filterBtn").on("click", function() {
        if ($("departLoc").val() == "") {
            alert("Departure Location is required.")
        } else if ($("arriveLoc").val() == "") {
            alert("Arrival Location is required.")
        } else if ($("departDate").val() == "") {
            alert("Departure Date is required.")
        } else {
            $("#searchfn").click();
        }
    });//filterflights
    
    $("#clearfilterbtn").on("click", function() {
        //clear all checkboxes
        $("input[type='checkbox']").prop("checked", false);
        //simulate click on search button to update results
        $("#searchfn").click();
    });//clearfilters
    
    $("#flights").on("click", ".card", function() {

        let flightNum = $(this).data("flight");
        let airline = $(this).data("airline");
        let start = $(this).data("start");
        let end = $(this).data("end");
        start = new Date(start).toISOString().slice(0,19).replace("T", " ");//"yyyy-mm-dd hh:mm:ss"
        end = new Date(end).toISOString().slice(0,19).replace("T", " ");
        //update modal contents 
        $("#addFlightModal .card").html($(this).html());
        $("#addFlightModal .btn-primary").data("flight", flightNum);
        $("#addFlightModal .btn-primary").data("airline", airline);
        $("#addFlightModal .btn-primary").data("start", start);
        $("#addFlightModal .btn-primary").data("end", end);
        //check if already selected and change modal to remove
        if ($(this).hasClass("border-primary")) {
            //change add btn to remove btn data-action and html text
            $("#addFlightModal .btn-primary").data("action", "remove").html("Remove from Cart");
            $("#addFlightModalLabel").html("Remove Flight");
        } else {
            //reset to add in-case was changed to remove
            $("#addFlightModal .btn-primary").data("action", "add").html("Add to Cart");
            $("#addFlightModalLabel").html("Add Flight");
        }
    });//flight chosen
    
    $("#hotelResults").on("click", ".card", function() {
        let hotelName = $(this).data("hotel");
        let start = $("#checkinDate").val();
        let end = $("#checkoutDate").val();
        //update modal contents 
        $("#addHotelModal .card").html($(this).html());
        $("#addHotelModal .btn-primary").data("hotel", hotelName);
        $('#addHotelModal input[name="checkinDate"]').attr("value", start);
        $('#addHotelModal input[name="checkoutDate"]').attr("value", end);
        //check if already selected and change modal to remove
        if ($(this).hasClass("border-primary")) {
            //change add btn to remove btn data-action and html text
            $("#addHotelModal .btn-primary").data("action", "remove").html("Remove from Cart");
            $("#addHotelModalLabel").html("Remove Hotel");
            //hide checkin and checkout dates? or change to disabled
            $("#hotelDates").attr("hidden", true);
        } else {
            //reset to add in-case was changed to remove
            $("#addHotelModal .btn-primary").data("action", "add").html("Add to Cart");
            $("#addHotelModalLabel").html("Add Hotel");
            //show checkin and checkout dates in case was hidden
            $("#hotelDates").attr("hidden", false);
        }
    });//hotel chosen
    
    $("#addFlightModal .btn-primary").on("click", function() {
        let flightNum = $(this).data("flight");
        let start = $(this).data("start");
        let end = $(this).data("end");
       //add or remove flight to cart using AJAX call
       let action = $(this).data("action");
       let title = $(this).data("airline") + " Flight " + flightNum;
       //add AJAX call
      $.ajax({
            method: "post",
            url: "/api/updateReservation",
            data: {"type": "flight",
                    "action": action,
                    "flightNum": flightNum,
                    "title": title,
                    "start": start,
                    "end": end
            },
            success: function(data, status) {
                //todo: use results to alert if added successfully or not
                //console.log("affectedRows: ", data.affectedRows);
                //update items in cart to +1
                let itemCount = Number($("#cart-item-count").html());
                if (action == "add") {
                    $("#cart-item-count").html(itemCount + 1);
                } else {
                    $("#cart-item-count").html(itemCount - 1);
                }
            }
        });//ajax
       $(`#flights .card[data-flight="${flightNum}"]`).toggleClass("border-primary");
    });
    
    $("#addHotelModal .btn-primary").on("click", function() {
        let hotelName = $(this).data("hotel");
        let modalContents = $(this).parent().parent();
        let start = modalContents.find('input[name="checkinDate"]').val();
        let end = modalContents.find('input[name="checkoutDate"]').val();
        //console.log("hotelName:", hotelName);
       //add or remove hotel to cart using AJAX call
       let action = $(this).data("action");
       //console.log("action", action);
       //add AJAX call
      $.ajax({
            method: "post",
            url: "/api/updateReservation",
            data: {"type": "hotel",
                    "action": action,
                    "hotel": hotelName,
                    "start": start + " 11:00:00", //default to 11am checkin
                    "end": end + " 11:00:00" //default to 11am checkout
            },
            success: function(data, status) {
                //todo: use results to alert if added successfully or not
                //console.log("affectedRows: ", data.affectedRows);
                //update items in cart to +1
                let itemCount = Number($("#cart-item-count").html());
                if (action == "add") {
                    $("#cart-item-count").html(itemCount + 1);
                } else {
                    $("#cart-item-count").html(itemCount - 1);
                }
            }
        });//ajax
       $(`#hotels .card[data-hotel="${hotelName}"]`).toggleClass("border-primary");
       $("#checkinDate").attr("value", start); //update search box if chose different dates in modal
       $("#checkoutDate").attr("value", end); //update search box if chose different dates in modal
    });
    
    $("#plzLoginModal .btn-primary").on("click", function() {
        //redirect to the login page
        window.location.href = "/login";
    });
    
    //Functions-------------------------------------
    
    function removeReservation(id) {
        return new Promise (function (resolve, reject) {
            $.ajax({
                method: "get",
                url: "/api/removeReservation",
                data: {
                    "id": id
                },
                success: function(data, status) {
                    resolve(data);
                }
            });//ajax
        });//promise
    }//removeReservation
    
    function getReservation(id) {
        return new Promise (function (resolve, reject) {
            $.ajax({
                method: "get",
                url: "/api/getReservation",
                data: {
                    "id": id
                },
                success: function(data, status) {
                    resolve(data);
                }
            });
        });
    }
    
    function getTotalReservationTotal(id) {
        return new Promise (function (resolve, reject) {
            $.ajax({
                method: "get",
                url: "/api/getTotalReservationTotal",
                data: {
                    "id": id
                },
                success: function(data, status) {
                    resolve(data);
                }
            });
        });
    }
    
    function checkoutReservation(id) {
        return new Promise (function (resolve, reject) {
            $.ajax({
                method: "get",
                url: "/api/checkoutReservation",
                data: {
                    "id": id
                },
                success: function(data, status) {
                    resolve(data);
                }
            });
        });
    }
    
    function contact(name, email, message) {
        return new Promise (function (resolve, reject) {
            $.ajax({
                method: "get",
                url: "/api/contact",
                data: {
                    "name": name,
                    "email": email, 
                    "message": message
                },
                success: function(data, status) {
                    resolve(data);
                }
            });
        });
    }
    
    function getUserInfo() {
        return new Promise (function (resolve, reject) {
            $.ajax({
                method: "get",
                url: "/api/getUserInfo",
                data: {
                },
                success: function(data, status) {
                    resolve(data);
                }
            });
        });
    }
    
    function updateUserInfo(username, firstname, lastname, age, title, phone, email, address) {
        return new Promise (function (resolve, reject) {
            $.ajax({
                method: "get",
                url: "/api/updateUserInfo",
                data: {
                    "username":username, 
                    "firstname":firstname, 
                    "lastname":lastname, 
                    "age":age, 
                    "title":title, 
                    "phone":phone, 
                    "email":email, 
                    "address":address
                },
                success: function(data, status) {
                    resolve(data);
                }
            });
        });
    }
});//ready
