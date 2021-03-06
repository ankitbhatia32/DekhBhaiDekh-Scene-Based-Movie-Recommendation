/**
 * Created by ADDY on 19/11/16.
 */
module.exports = function(app){

    var elasticsearch = require('elasticsearch');
    var bodyParser    = require('body-parser');
    app.use(bodyParser.json()); // for parsing application/json
    app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

    var q = require("q");
    var request = require("request");
    var AWS = require('aws-sdk');
    var index = [];
    var values = [];
    var uniqueResponse = [];

    AWS.config.update({region: 'us-east-1'});


    var sqs = new AWS.SQS({apiVersion: '2012-11-05'});

    var client = new elasticsearch.Client({
        host: 'https://search-movies-5zcbuwmhuftqplir3dnm72jd4a.us-east-1.es.amazonaws.com/complete_movies'
    });


    function getMovieData(type){

        var deferred = q.defer();

        console.log("querring for movie : "+type);
        client.search({
            size: 1,
            q: "key:"+type

        }).then(function (body) {

            var hits = body.hits.hits;
            console.log("hits length : " + hits.length);
            console.log("movie key : "+hits[0]._source.key);
            deferred.resolve(hits[0]);
        }, function (error) {
            console.trace(error.message);
            deferred.reject(error);
        });

        return deferred.promise;

    }


    function getMovie(type){
        var deferred = q.defer();

        var queryType = type.split('|');
        var queryKeyword = null;
        var count = 0;
        if(queryType[0] == "search"){
            queryKeyword = queryType[1];
            count = 20;
        }
        else{
            queryKeyword = queryType[1];
            for(var i=0;i<queryKeyword.length;i++){
                if(queryKeyword[i] == '!' || queryKeyword[i] == '.' || queryKeyword[i] == ':' )
                    queryKeyword = queryKeyword.replace('!', ' ');
                    queryKeyword = queryKeyword.replace('.', ' ');
                    queryKeyword = queryKeyword.replace(':', ' ');
            }

            queryKeyword = queryKeyword.slice(0, -1);
            queryKeyword = "key: " +queryKeyword;
            count = 20
        }

        console.log("querrying for this");
        console.log(queryKeyword);

        client.search({
            size: count,
            q: queryKeyword

        }).then(function (body) {

            var hits = body.hits.hits;
            console.log("hits length : " + hits.length);
            index = [];
            values = [];
            uniqueResponse = [];
            for(var i=0;i<hits.length;i++){
                if(hits[i]._source.rating == 'N/A'){
                    hits[i]._source.rating = '0';
                }
                if(checkValue(hits[i]._source.key) ) {
                    values.push(hits[i]._source.key);
                    index.push(i);
                }
            }
            for(i=0;i<index.length;i++){
                uniqueResponse.push(hits[index[i]]);
            }

            uniqueResponse.sort(function (a,b) {
                return parseFloat(b._source.rating) - parseFloat(a._source.rating)
            });

            for(i=0;i<uniqueResponse.length;i++){
                console.log(uniqueResponse[i]._source.key);
            }
            console.log(values.length);
            console.log(index.length);
            console.log(uniqueResponse.length);

            function checkValue(value){
                var result = true;
                if(values.length == 0) result = true;
                for(var i=0; i<values.length; i++){
                    if(value == values[i]){
                        result =  false;
                    }
                }
                return result;
            }

            deferred.resolve(uniqueResponse);
        }, function (error) {
            console.trace(error.message);
            deferred.reject(error);
        });

        return deferred.promise;

    }



    function pushingToSQS(req, res){

        var usersign = req.body;
        console.log(usersign);

        var sendParams = {
            MessageBody: JSON.stringify(usersign),
            /* required */
            QueueUrl: 'https://sqs.us-east-1.amazonaws.com/829344914533/clickstreamdata', /* required */
            DelaySeconds: 0,
            MessageAttributes: {}
        };

        sqs.sendMessage(sendParams, function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else {
                console.log("Pushed to SQS\n");

            }
        });

    }

    app.post  ('/api/sqs/usersign', pushingToSQS);

    app.get("/api/es/:type", getData);
    app.get("/api/es/moviekey/:type", getMovieDetails);


    function getMovieDetails(request, respond){
        var type = request.params.type;
        console.log("key : "+type);
        getMovieData(type)
            .then(function(movieData){
                console.log("result is "+movieData._source.synopsis);
                respond.json(movieData)});
    }

    function getData(req, res){
        var type = req.params.type;
        console.log(type);
        getMovie(type)
            .then(function(result){
                console.log("count sent: "+result.length);
                res.json(result)});
    }
};