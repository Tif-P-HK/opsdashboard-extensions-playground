define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dijit/_WidgetBase",
  "dijit/_TemplatedMixin",
  "dojo/dom-class",
  "esri/opsdashboard/WidgetProxy",
  "esri/opsdashboard/MapWidgetProxy",
  "esri/geometry/webMercatorUtils",
  "esri/config",
  "esri/request",
  "dojo/text!./weatherTemplate.html"
], function (declare, lang, _WidgetBase, _TemplatedMixin, domClass, WidgetProxy, MapWidgetProxy, webMercatorUtils, esriConfig, esriRequest, templateString) {

  return declare("WeatherWidget", [_WidgetBase, _TemplatedMixin, WidgetProxy], {
    templateString: templateString,

    //TODO:
    // - Add loading page
    // - Revisit CSS (using display: table)
    // - Revisit satellite image display
    // - Move images to img folder
    // - Handle map widget removal
    // - Handle map extent changed


    // ***************************************************************
    // NOTE: To run this sample, you must sign up for and enter here a
    // free Weather Underground Developer API key.
    // Sign up at http://www.wunderground.com/weather/api/
    // ****************************************************************
    hostReady: function () {
      var domain = "api.wunderground.com";
      // TODO: remove the following line
      domain = "gist.githubusercontent.com";
      esriConfig.defaults.io.corsEnabledServers.push(domain);

      // TODO: replace dev key
      var _developerKey = "yourDeveloperKey"; // ENTER YOUR WEATHER UNDERGROUND DEVELOPER API KEY HERE
      this.weatherServiceUrl = "http://" + domain + "/api/" + _developerKey + "/conditions/satellite/webcams/q/";

      // Listen to map extent changed by subscribing to map events
      //var mapWidget = this.mapWidgetProxy;
      //mapWidget.subscribeToMapEvents();

      if(!_developerKey){
        this.showWarningPage("Enter a Weather Underground developer key to run this sample");
        return;
      }

      this.mapWidgetProxy.getMapExtent().then(function(extent){

        // If spatial reference is Web Mercator, convert point to Geographic, otherwise assume Geographic
        var mapCenter = extent.getCenter();
        var geoMapCenter = mapCenter.spatialReference.isWebMercator() ?
          webMercatorUtils.webMercatorToGeographic(mapCenter) : mapCenter;

        // Get the weather information at the map center
        this.getWeatherInformation(geoMapCenter);
      }.bind(this), function(error){
        this.showWarningPage("Error getting map extent");
        console.log("Error: ", error.message);
      });
    },

    mapExtentChanged: function(){
      alert("extent changed");
    },

    getWeatherInformation: function(geoMapCenter){
      // Append location information to the weather service URL
      this.weatherServiceUrl += geoMapCenter.getLatitude() + "," + geoMapCenter.getLongitude() + ".json";
      // TODO: remove temp url:
      this.weatherServiceUrl = "https://gist.githubusercontent.com/Tif-P-HK/3dda647389e7250ee0f8/raw/db1ab499bc1a3fafecfb28cf7531b4394e8760ab/weatherUnderground.json";
      console.log("weather Service Url: " + this.weatherServiceUrl);

      // Request for weather information
      // TODO: double-check on params
      esriRequest({
        url: this.weatherServiceUrl
      }).then(function(response){
        console.log("request succeeded, response: " + response);
        this.displayResult(response);
      }.bind(this), function(error){
        this.showWarningPage("Error getting weather information");
        console.log("Error: ", error.message);
      })
    },

    displayResult: function(response){

      // Store the weather information result (this.observation) and satellite image (this.satellite) separately
      var observation = response.current_observation;
      var satellite = response.satellite;

      // Show the location information
      this.fullLocationName.innerHTML = observation.display_location.full;
      this.observationTime.innerHTML = observation.observation_time;

      // Display the observation result on details page
      this.weather.innerHTML = observation.weather;

      this.weatherImg.src = observation.icon_url;
      this.weatherImgCaption.innerHTML = observation.temp_f + "&deg;F (" + observation.temp_c + "&deg;C); " +
        "Feels like " + observation.feelslike_f + "&deg;F (" + observation.feelslike_c + "&deg;C)";

      this.uv.innerHTML= observation.UV;
      this.windInfo.innerHTML = observation.wind_dir + " " + observation.wind_mph + " mph";
      this.precipitationToday.innerHTML = observation.precip_today_string;
      this.relativeHumidity.innerHTML = observation.relative_humidity;
      this.dewPoint.innerHTML = observation.dewpoint_f + "&deg;F (" + observation.dewpoint_c + "&deg;C)";
      this.visibility.innerHTML = observation.visibility_mi + " mi (" + observation.visibility_km + " km)";


      // Display the satellite image result on Map page
      this.visibleSatelliteImage.src = satellite.image_url_vis;

      // Update the UI
      this.showResultsPage();
    },

    showLoadingPage: function(){
      domClass.remove(this.loadingPage, "hide");
      domClass.add(this.resultsPage, "hide");
      domClass.add(this.warningPage, "hide");
    },

    showResultsPage: function(){
      domClass.add(this.loadingPage, "hide");
      domClass.remove(this.resultsPage, "hide");
      domClass.add(this.warningPage, "hide");
    },

    showWarningPage: function(message){
      this.warningMsg.innerHTML = message;

      domClass.add(this.loadingPage, "hide");
      domClass.add(this.resultsPage, "hide");
      domClass.remove(this.warningPage, "hide");
    },

    showDetailsPage: function(){
      domClass.remove(this.detailsPage, "hide");
      domClass.add(this.mapPage, "hide");

      domClass.add(this.detailsPageBtn, "active");
      domClass.remove(this.mapPageBtn, "active");
    },

    showMapPage: function(){
      domClass.add(this.detailsPage, "hide");
      domClass.remove(this.mapPage, "hide");

      domClass.remove(this.detailsPageBtn, "active");
      domClass.add(this.mapPageBtn, "active");
    }

  });
});























