define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/dom-class",
  "dojo/Deferred",
  "esri/tasks/Geoprocessor",
  "esri/graphic",
  "esri/geometry/webMercatorUtils",
  "esri/geometry/geodesicUtils",
  "esri/units",
  "esri/tasks/FeatureSet",
  "esri/Color",
  "esri/symbols/SimpleLineSymbol",
  "esri/symbols/SimpleMarkerSymbol",
  "esri/geometry/Point",
  "dijit/_WidgetBase",
  "dijit/_TemplatedMixin",
  "esri/opsdashboard/WidgetProxy",
  "dojo/text!./elevationProfileWidgetTemplate.html"
], function(
  declare,
  lang,
  domClass,
  Deferred,
  Geoprocessor,
  Graphic,
  webMercatorUtils,
  geodesicUtils,
  Units,
  FeatureSet,
  Color,
  SimpleLineSymbol,
  SimpleMarkerSymbol,
  Point,
  _WidgetBase,
  _TemplatedMixin,
  WidgetProxy,
  templateString){
  return declare("elevationProfileWidget", [_WidgetBase, _TemplatedMixin, WidgetProxy], {

    templateString: templateString,

    constructor: function(){
      this.inherited(arguments);

      // Set the default unit to US standard (distance unit is miles)
      this.unit = "Miles";

      // Margins for the profile graph SVG
      this.margins = {top: 20, right: 20, bottom: 40, left: 60};

      // Input line to be shown on the map
      var outlineSymbol = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color("#192a64"), 3);
      this.inputLineGraphic = new Graphic(null, outlineSymbol);

      // A cross symbol that marks the corresponding map location when user hovers on the profile graph
      var chartLocationSymbol = new SimpleMarkerSymbol(
        SimpleMarkerSymbol.STYLE_X,
        15,
        new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color("#000000"), 1),
        new Color("#000000"));
      this.locationGraphic = new Graphic(null, chartLocationSymbol);
    },

    postCreate: function(){
      this.inherited(arguments);

      // Set up the x and y ranges to fit the profile graph UI into the widget's window
      this.calculateRanges();

      // When window resizes, redraw the profile graph based on the new dimension
      window.onresize = lang.hitch(this, function(){
        this.calculateRanges();

        if(this.profileGraph){
          this.clearProfileGraph();
          this.showProfileGraph();
        }
      });
    },

    calculateRanges: function(){
      this.height = window.innerHeight;
      this.width = window.innerWidth;

      this.xRange = d3.scale.linear()
        .range([this.margins.left, this.width - this.margins.right]);

      this.yRange = d3.scale.linear()
        .range([this.height - this.margins.top, this.margins.bottom]);
    },

    hostReady: function(){
      // Set up the elevation profile geoprocessing service
      // when the host (Operations Dashboard) is ready

      // Retrieve the async elevation service specified for the organization
      // Note: The elevationProfileWidget.json manifest file must have
      // the "usePortalServices" set to true in order for the elevation service
      // (and any other helper services) to be retrieved
      if(!this.portalHelperServices || !this.portalHelperServices.elevationSync){
        console.log("Cannot get the elevation service.");
        return;
      }

      var profileServiceUrl = this.portalHelperServices.elevationSync.url + "/Profile";
      this.profileService = new Geoprocessor(profileServiceUrl);
      this.profileService.outSpatialReference = this.mapWidgetProxy.spatialReference;

      // Create a graphics layer to contain the input line and the location marker graphics
      return this.mapWidgetProxy.createGraphicsLayerProxy().then(lang.hitch(this, function(graphicsLayerProxy){

        this.graphicsLayerProxy = graphicsLayerProxy;
        this.graphicsLayerProxy.addOrUpdateGraphics([this.inputLineGraphic, this.locationGraphic]);
      }));
    },

    hostInitializationError: function (err) {
      // Called when the widget could not establish contact with Operations Dashboard
      console.log(err);
    },

    drawLine: function(){
      // Called when the Draw Line button is clicked
      // Activate the drawing toolbar, and show the waiting page until the drawing finishes

      this.activateDrawingToolbar({geometryTypes: ["polyline"]}).then(lang.hitch(this, function(result){
        if(!result)
          console.log("Error activating drawing toolbar");
        else
          this.showWaitingPage();
      }), lang.hitch(this, function(err){
        console.log("Error activating drawing toolbar " + err);
      }));
    },

    cancelDrawLine: function(){
      // User clicks the Start Again button. Reset the widget to the startup state

      this.deactivateDrawingToolbar(this.mapWidgetProxy);
      this.showStartupPage();
    },

    toolbarDrawComplete: function(inputLine){
      // Capture the geometry of the input line,
      // then use it to calculate the elevation profile

      this.deactivateDrawingToolbar(this.mapWidgetProxy);

      this.showCalculatingPage();

      this.calculateElevationInfos(inputLine).then(lang.hitch(this, function(elevationInfos){

        // Calculate the elevation profile
        this.elevationInfos = elevationInfos;

        // Hide the loading icon and show the profile graph
        this.showResultPage();

        if(!this.elevationInfos || !this.elevationInfos.elevations || !this.elevationInfos.locations){
          console.log("Unable to get the elevation info");
          return;
        }

        // Set the input line's geometry, then update its host graphics layer
        this.inputLineGraphic.setGeometry(inputLine);
        this.graphicsLayerProxy.addOrUpdateGraphic(this.inputLineGraphic);

        // Show the elevation info on the profile graph
        this.showProfileGraph();

      }), lang.hitch(this, function(err){
        // Error occurred when calculating the elevation profile
        // Reset the widget to the startup state

        alert(err);
        this.showStartupPage();
      }));
    },

    drawingToolbarDeactivated: function(){
      // Issue: Once the drawing toolbar is deactivated, it cannot be activated again

      this.showStartupPage();
    },

    calculateElevationInfos: function (inputLine) {
      // Calculate the elevation profile for the input line

      var deferred = new Deferred();

      //Convert web mercator polyline to geographic, then get the sampling distance
      //Assume geographic if not in web mercator
      var geoPolyline = (inputLine.spatialReference.isWebMercator()) ?
        webMercatorUtils.webMercatorToGeographic(inputLine) : inputLine;
      var profileLengthMeters = geodesicUtils.geodesicLengths([geoPolyline], this.getUnitConstant())[0];
      var samplingDistance = (profileLengthMeters / 198);

      // Create input feature set for the geoprocessing task

      var inputLineFeatures = new FeatureSet();
      inputLineFeatures.fields = [{
        "name": "OID",
        "type": "esriFieldTypeObjectID",
        "alias": "OID"
      }];

      var inputProfileGraphic = new Graphic(inputLine, null, {OID: 1});
      inputLineFeatures.features = [inputProfileGraphic];

      this.profileService.execute({
        "InputLineFeatures": inputLineFeatures,
        "ProfileIDField": "OID",
        "DEMResolution": "FINEST",
        "MaximumSampleDistance": samplingDistance,
        "MaximumSampleDistanceUnits": this.unit,
        "returnZ": true,
        "returnM": true
      }).then(lang.hitch(this, function (results) {

        if (results.length > 0) {
          // Add the elevation info (m and z values) and locations infos (x and y values)
          // into two arrays. They will be used to update the profile graph
          var outputProfileLayer = results[0].value;
          if (outputProfileLayer.features.length > 0) {

            var profile = outputProfileLayer.features[0].geometry;

            if (profile.paths.length > 0) {
              var profilePath = profile.paths[0];

              var elevations = [];
              var locations = [];
              profilePath.forEach(lang.hitch(this, function(profilePoint){
                var elevationInfo = {
                  m: profilePoint[3],
                  z: profilePoint[2]
                };
                var locationInfo = {
                  x: profilePoint[0],
                  y: profilePoint[1]
                };
                elevations.push(elevationInfo);
                locations.push(locationInfo);
              }));

              deferred.resolve({
                locations: locations,
                elevations: elevations
              });
            } else {
              deferred.reject(new Error("unable to get elevation information"));
            }
          } else {
            deferred.reject(new Error("unable to get elevation information"));
          }
        } else {
          deferred.reject(new Error("unable to get elevation information"));
        }
      }), deferred.reject);

      return deferred.promise;
    },

    showProfileGraph: function(){
      // Show the elevation data on a line chart

      if(!this.elevationInfos)
        return;

      var elevations = this.elevationInfos.elevations;
      var locations = this.elevationInfos.locations;

      // m and z values are in meters.
      // They need to be converted into user's selected unit
      elevations = this.convertElevationInfoFromMeter(elevations);

      // set the preserveAspectRatio to none so that the SVG will scale
      // to fit entirely into the viewBox
      this.profileGraph = d3.select("#profileGraph")
        .attr("viewBox", "0 0 " + this.width + " " + this.height)
        .attr("preserveAspectRatio", "none");

      // ********************************************************
      // Map the x and y (for displaying m and z values respectively) domains into their ranges
      this.xRange.domain([
        d3.min(elevations, function(d){return d.m}),
        d3.max(elevations, function(d){return d.m})
      ]);

      this.yRange.domain([
        d3.min(elevations, function(d){return d.z}),
        d3.max(elevations, function(d){return d.z})
      ]);

      // ********************************************************
      // Set up the axes
      var xAxis = d3.svg.axis()
        .scale(this.xRange)
        .tickSize(1)
        .tickFormat(this.mValueFormat());

      var yAxis = d3.svg.axis()
        .scale(this.yRange)
        .tickSize(1)
        .orient("left")
        .tickFormat(this.zValueFormat());

      // Create the axes UI
      this.profileGraph.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0, " + (this.height - this.margins.bottom) + ")")
        .call(xAxis);

      this.yTranslate = this.margins.top - this.margins.bottom;
      this.profileGraph.append("g")
        .attr("class", "y axis")
        .attr("transform", "translate(" + (this.margins.left) + ", " + this.yTranslate + ")")
        .call(yAxis);

      // Add titles to the axes:
      // x axis
      this.profileGraph.append("text")
        .attr("class", "title")
        .attr("text-anchor", "middle")
        .attr("x", this.width/2)
        .attr("y", this.height - 3)
        .text("Distance in " + this.unit);

      // y axis
      this.profileGraph.append("text")
        .attr("class", "title")
        .attr("text-anchor", "middle")
        .attr("transform", "translate("+ (this.margins.left/3 - 2) +","+(this.height/2)+ ")rotate(-90)")
        .text("Elevation in " + this.getZValueUnit());

      // ********************************************************
      // Define the line function, then use it to render the profile line
      var lineFunction = d3.svg.line()
        .x(lang.hitch(this, function(d){return this.xRange(d.m);}))
        .y(lang.hitch(this, function(d){return this.yRange(d.z);}))
        .interpolate("linear");

      this.profileGraph.append("path")
        .attr("class", "chart path")
        .attr("d", lineFunction(elevations))
        .attr("transform", "translate(0, "+ this.yTranslate + ")"); //TODO: need the last line??

      // ********************************************************
      // Create two area charts to color the profile line's background,
      // one above the line and one below

      // Area chart above the profile line
      //TODO: review
      var areaAboveFunction = d3.svg.area()
        .x(lang.hitch(this, function(d){return this.xRange(d.m);}))
        .y0(0)
        .y1(lang.hitch(this, function(d){return this.yRange(d.z);}));

      this.profileGraph.append("path")
        .datum(elevations)
        .attr("class", "areaAbove")
        .attr("d", areaAboveFunction)
        .attr("transform", "translate(0, " + this.yTranslate + ")");

      // Area chart below the profile line
      var areaBelowFunction = d3.svg.area()
        .x(lang.hitch(this, function(d){return this.xRange(d.m);}))
        .y0(lang.hitch(this, function(d){return this.yRange(d.z);}))
        .y1(this.height - this.margins.bottom - this.yTranslate );

      this.profileGraph.append("path")
        .datum(elevations)
        .attr("class", "areaBelow")
        .attr("d", areaBelowFunction)
        .attr("transform", "translate(0, " + this.yTranslate + ")");

      // ********************************************************
      // When hovering on the line chart, show a circle at the corresponding point on the profile line,
      // and show the z value based on the closest m value
      var focus = this.profileGraph.append("g")
        .style("display", "none")
        .attr("class", "focus");

      focus.append("circle")
        .attr("r", 4.5);

      focus.append("text")
        .attr("x", 8)
        .attr("y", "1.3em");

      //// Icon source: http://findicons.com/icon/423523/paper_mario?id=423632
      //focus.append("image")
      //  .attr("xlink:href", "./paper_mario.ico")
      //  .attr("width", 38)
      //  .attr("height", 38)
      //  .attr("x", 3)
      //  .attr("y", "-2em");

      // ********************************************************
      // Display a vertical line on the chart when hovering the mouse over
      // Start by keeping the line off screen (i.e. set x1, x2 to -1)
      this.profileGraph.append("line")
        .attr("class", "yLine")
        .attr("x1", -1)
        .attr("x2", -1)
        .attr("y1", this.margins.top)
        .attr("y2", this.height + this.margins.top - this.margins.bottom);

      // ********************************************************
      // When mouse moves on the profile graph:
      // - Update the x coordinate of a vertical line which overlays the graph to highlight the current mouse position
      // - Update the mouse marker and elevation text that move along with the line
      // - Update the locationGraphic on the map to highlight the corresponding map location

      this.profileGraph.append("rect")
        .attr("class", "overlay")
        .attr("width", this.width)
        .attr("height", this.height)
        .on("mouseover", function() { focus.style("display", "inline"); })
        .on("mousemove", lang.hitch(this, function(){

          // Translate the mouse position to the corresponding elevation and location info

          // _m: the value interpolated from this.xRange based on the current mouse position
          var _m = this.xRange.invert(d3.mouse(this.domNode)[0]);

          // i: the index of _m when it's compared with all m vales in elevations
          var bisectM = d3.bisector(function(d) { return d.m; }).left;
          var i = bisectM(elevations, _m);

          // dElevations[0]: the elevation info whose m value is just smaller than _m
          // dElevations[1]: the elevation info whose m value is just greater than _m
          var dElevation0 = elevations[i - 1];
          var dElevation1 = elevations[i];

          // dElevation: equals dElevation1 if dElevation1.m is closer to _m, otherwise equals dElevation0
          var dElevation;
          if(_m - dElevation0.m > dElevation1.m - _m){
            dElevation = dElevation1;
          }
          else {
            dElevation = dElevation0;
            --i;
          }
          var m = dElevation.m;
          var z = dElevation.z;

          // Slide the vertical line along the x axis as the mouse moves:
          // If its x position < this.margins.left (i.e. th line is on the left side of the y-axis),
          // move the line off-screen (-1); Otherwise, slide the line as the mouse move
          var x = this.xRange(m) < this.margins.left? -1 : this.xRange(m);
          this.profileGraph.select(".yLine")
            .attr("x1", x)
            .attr("x2", x);

          // Show the mouse marker and elevation text next to the vertical line
          var elevationText = this.zValueFormat()(z) + " " + this.getZValueUnit();
          focus.select("text").text(elevationText);
          focus.attr("transform", "translate(" + this.xRange(m) + "," + (this.yTranslate + this.yRange(z)) + ")");

          // Update the geometry of the locationGraphic
          // location: the location information at the given dElevation
          var location = locations[i];
          this.locationGraphic.setGeometry(new Point(location.x, location.y, this.mapWidgetProxy.spatialReference));
          this.graphicsLayerProxy.addOrUpdateGraphic(this.locationGraphic);

        }));
    },

    clearResult: function(){
      // Destroy the elements appended to the chart and remove the map graphics
      // Then show startup page
      this.clearProfileGraph();

      this.graphicsLayerProxy.clear();

      this.showStartupPage();
    },

    clearProfileGraph: function(){
      // Clear the UIs appended to the graph

      if(!this.profileGraph)
        return;

      this.profileGraph.selectAll("g").remove();
      this.profileGraph.selectAll("path").remove();
      this.profileGraph.selectAll("line").remove();
      this.profileGraph.selectAll("text").remove();
      this.profileGraph.selectAll("rect").remove();
    },

    selectedUnitChanged: function(){
      // Selected unit has changed. Clear the profile graph elements and recreate them
      if(this.unit === "Miles")
        this.unit = "Kilometers";
      else
        this.unit = "Miles";

      this.clearProfileGraph();
      this.showProfileGraph();
    },

    getUnitConstant: function(){
      // Return the unit constant based on the given string
      // Default is Units.Miles
      if(this.unit === "Kilometers")
        return Units.KILOMETERS;
      else if(this.unit === "Miles")
        return Units.MILES;
    },

    convertElevationInfoFromMeter: function(elevations){
      // For each item in elevationInfos, convert the m and z values to their appropriate unit using this.unit
      // TODO: Is it possible to do something like LINQ does
      var newM, newZ;
      var newElevations = [];
      elevations.forEach(lang.hitch(this, function(elevation){
        // Convert m and z
        if(this.unit == "Kilometers"){
          // If unit is metric: convert m (distance) from meter to km, no need to convert z (elevation)
          newM = elevation.m * 0.001;
          newZ = elevation.z;
        }
        else if(this.unit == "Miles")
        {
          // If unit is US standard: convert m (distance) from meter to mile, convert z (elevation) to feet
          newM = elevation.m * 0.000621371;
          newZ = elevation.z * 3.28084;
        }
        newElevations.push({
          m: newM,
          z: newZ
        });
      }));
      return newElevations;
    },

    getZValueUnit: function(){
      // Return the y-axis label based on the distance unit
      if(this.unit === "Kilometers")
        return "Meters";
      else if(this.unit === "Miles")
        return "Feet";
    },

    zValueFormat: function(){
      return d3.format(",.0f");
    },

    mValueFormat: function(){
      return d3.format(",.2f");
    },

    showStartupPage: function(){
      // Show the widget start up page with a button to let user
      // activate the drawing toolbar

      domClass.remove(this.drawLineMsg, "hide");
      domClass.add(this.waitingMsg, "hide");
      domClass.add(this.calculatingMsg, "hide");
      domClass.add(this.showGraphMsg, "hide");
    },

    showWaitingPage: function(){
      // The page to show when user is drawing a line on the map

      domClass.add(this.drawLineMsg, "hide");
      domClass.remove(this.waitingMsg, "hide");
      domClass.add(this.calculatingMsg, "hide");
      domClass.add(this.showGraphMsg, "hide");
    },

    showCalculatingPage: function(){
      // Show the loading page while the result is being calculated

      domClass.add(this.drawLineMsg, "hide");
      domClass.add(this.waitingMsg, "hide");
      domClass.remove(this.calculatingMsg, "hide");
      domClass.add(this.showGraphMsg, "hide");
    },

    showResultPage: function(){
      // Show the result page that displays the elevation profile

      domClass.add(this.drawLineMsg, "hide");
      domClass.add(this.waitingMsg, "hide");
      domClass.add(this.calculatingMsg, "hide");
      domClass.remove(this.showGraphMsg, "hide");
    }
  });
});