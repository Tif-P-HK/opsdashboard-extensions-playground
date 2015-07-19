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
      this.unit = "Miles";

      // Variables for the line chart SVG
      this.margins = {top: 20, right: 20, bottom: 40, left: 60};

      // Input line and marker graphics to be shown on the map
      var outlineSymbol = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color("#192a64"), 3);
      this.inputLineGraphic = new Graphic(null, outlineSymbol);

      // Create a location graphic to indicate the map location when user hovers on the profile graph
      var chartLocationSymbol = new SimpleMarkerSymbol(
        SimpleMarkerSymbol.STYLE_X,
        15,
        new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color("#000000"), 1),
        new Color("#000000"));
      this.chartLocationGraphic = new Graphic(null, chartLocationSymbol);
    },

    postCreate: function(){
      this.inherited(arguments);

      // Set up the x and y range to fit the profile graph UI into the widget's window
      this.calculateRanges();

      // When window resizes, recalculate the x and y ranges
      // update the dimensions of the SVG when the dimension of the widget changes
      window.onresize = lang.hitch(this, function(){
        this.calculateRanges();
      });
    },

    calculateRanges: function(){
      // width and height of the chart
      this.height = window.innerHeight;
      this.width = window.innerWidth;

      // Set up the range to fit the profile graph into the widget's window
      this.xRange = d3.scale.linear()
        .range([this.margins.left, this.width - this.margins.right]);

      this.yRange = d3.scale.linear()
        .range([this.height - this.margins.top, this.margins.bottom]);
    },

    hostReady: function(){
      // Set up the elevation profile geoprocessing service
      // when the host (Operations Dashboard) is ready

      // Retrieve the async elevation service specified for the organization
      // Note: The elevationProfileFeatureAction.json manifest file must have
      // the "usePortalServices" set to true in order for the elevation  service
      // (and any other helper services) to be retrieved
      if(!this.portalHelperServices || !this.portalHelperServices.elevationSync){
        console.log("Cannot get the elevation service.");
        return;
      }

      var profileServiceUrl = this.portalHelperServices.elevationSync.url + "/Profile";

      // Set up the Geoprocessing service for calculating the elevation profile
      this.profileService = new Geoprocessor(profileServiceUrl);
      this.profileService.outSpatialReference = this.mapWidgetProxy.spatialReference;

      // Set the distance unit using the value from dataSourceConfigs
      if(this.dataSourceConfigs[0].distanceUnit)
        this.unit = this.dataSourceConfigs[0].distanceUnit;

      // Create a graphics layer for the input line graphic
      return this.mapWidgetProxy.createGraphicsLayerProxy().then(lang.hitch(this, function(graphicsLayerProxy){

        // Make a reference to graphicsLayerProxy, then add the input line graphic and the marker graphic
        this.graphicsLayerProxy = graphicsLayerProxy;
        this.graphicsLayerProxy.addOrUpdateGraphics([this.inputLineGraphic, this.chartLocationGraphic]);
      }));
    },

    hostInitializationError: function (err) {
      // Called when the widget could not establish contact with Operations Dashboard
      console.log(err);
    },

    drawLine: function(){
      // Called when the "Draw Line" button is clicked
      // Activate the drawing toolbar when the Draw Line button is clicked
      // Show the loading icon until the profile graph calculation is done (or error-out)
      this.activateDrawingToolbar({geometryTypes: ["polyline"]}).then(lang.hitch(this, function(result){
        if(!result)
          console.log("Error activating drawing toolbar");
        else
          this.showWaitingPage();
      }), lang.hitch(this, function(err){
        console.log("Error activating drawing toolbar " + err);
      }));
    },

    // TODO: potential API issue: If the Cancel button on the drawing toolbar is clicked, the tool cannot be initiated again
    cancelSketch: function(){
      // User clicks the Cancel button, reset the widget to the startup state

      this.deactivateDrawingToolbar(this.mapWidgetProxy);
      this.showStartupPage();
    },

    toolbarDrawComplete: function(inputLine){
      // Capture the geometry of the input line,
      // then use it to calculate the elevation profile

      this.showCalculatingPage();

      // Calculate the elevation profile
      this.generateProfileGraph(inputLine).then(lang.hitch(this, function(elevationInfos){

        // Hide the loading icon and show the profile graph
        this.showResultPage();

        if(!elevationInfos || !elevationInfos.elevations || !elevationInfos.locations){
          console.log("Unable to get the elevation info");
          return;
        }

        // Set the input line's geometry, then update its host graphics layer
        this.inputLineGraphic.setGeometry(inputLine);
        this.graphicsLayerProxy.addOrUpdateGraphic(this.inputLineGraphic);

        // Show the elevation info on a profile graph
        this.showProfileGraph(elevationInfos);
      }), lang.hitch(this, function(err){
        // Error occurred when calculating the elevation profile
        // Reset the widget to the startup state

        alert(err);
        this.showStartupPage();
      }));

      // TODO: investigate why the autoDeactivate property isn't working
      this.deactivateDrawingToolbar(this.mapWidgetProxy);
    },

    // TODO: investigate: after calling this the toolbar won't come up again
    drawingToolbarDeactivated: function(){
      // User has canceled the drawing activity, reset the widget
      this.showStartupPage();
    },

    generateProfileGraph: function (inputLine) {
      // Calculate the elevation profile for the input line

      var deferred = new Deferred();

      //Convert web mercator polyline to geographic, then get the sampling distance
      //Assume geographic if not in web mercator
      var geoPolyline = (inputLine.spatialReference.isWebMercator()) ?
        webMercatorUtils.webMercatorToGeographic(inputLine) : inputLine;
      var profileLengthMeters = geodesicUtils.geodesicLengths([geoPolyline], this.getUnitConstant())[0];
      var samplingDistance = (profileLengthMeters / 198);

      // Create input feature set for GP Task
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
                // m and z values are in meters.
                // They need to be converted into user's selected unit
                var elevationInfo = {
                  m: this.convertMFromMeter(profilePoint[3]),
                  z: this.convertZFromMeter(profilePoint[2])
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

    //TODO: fix label size
    // http://eyeseast.github.io/visible-data/2013/08/28/responsive-charts-with-d3/
    showProfileGraph: function(elevationInfos){
      // Show the elevation data on a d3 line chart, and
      // show the location info on the map

      var elevations = elevationInfos.elevations;
      var locations = elevationInfos.locations;

      // set the preserveAspectRatio to none so that the SVG will scale
      // to fit entirely into the viewBox
      this.profileGraph = d3.select("#profileGraph")
        .attr("viewBox", "0 0 " + this.width + " " + this.height)
        .attr("preserveAspectRatio", "none");

      // ********************************************************
      // Map the x and y domains into their respective ranges
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
        .tickFormat(d3.format(",.0f"));

      var yAxis = d3.svg.axis()
        .scale(this.yRange)
        .tickSize(1)
        .orient("left")
        .tickFormat(d3.format(",.0f"));

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

      // Add titles to the axes
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
        .text("Elevation in " + this.getYAxisLabel());

      // ********************************************************
      // Define the line function, then use it to render the profile line
      var lineFunction = d3.svg.line()
        .x(lang.hitch(this, function(d){return this.xRange(d.m);}))
        .y(lang.hitch(this, function(d){return this.yRange(d.z);}))
        .interpolate("linear");

      this.profileGraph.append("path")
        .attr("class", "chart path")
        .attr("d", lineFunction(elevations))
        .attr("transform", "translate(0, "+ this.yTranslate + ")");

      // ********************************************************
      // Create two area charts for coloring the SVG's background.
      // One chart is above the profile line and one below

      // Area chart above the profile line
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
      // When hovering on the chart, show a circle at the corresponding point on the profile line,
      // and show the z value based on the closest m value
      var focus = this.profileGraph.append("g")
        .style("display", "none")
        .attr("class", "focus");

      /*
       Icon source:
       http://findicons.com/icon/423523/paper_mario?id=423632
       */
      focus.append("image")
        .attr("xlink:href", "./paper_mario.ico")
        .attr("width", 38)
        .attr("height", 38)
        .attr("dx", 5)
        .attr("dy", 0);

      focus.append("circle")
        .attr("r", 4.5);

      focus.append("text")
        .attr("x", 8)
        .attr("dy", -8);

      // ********************************************************
      // Display a vertical line on the x-axis of the graph when the mouse moves
      // Start by keeping the line off screen (i.e. set x1, x2 to -1)
      this.profileGraph.append("line")
        .attr("class", "yLine")
        .attr("x1", -1)
        .attr("x2", -1)
        .attr("y1", this.margins.top)
        .attr("y2", this.height + this.margins.top - this.margins.bottom);

      // ********************************************************
      // Update the "focus" and the vertical line when mouse moves
      this.bisectM = d3.bisector(function(d) { return d.m; }).left;

      this.profileGraph.append("rect")
        .attr("class", "overlay")
        .attr("width", this.width)
        .attr("height", this.height)
        .on("mouseover", function() { focus.style("display", null); })
        .on("mousemove", lang.hitch(this, function(){

          // Show a circle and the text
          // Calculate their positions based on the m value
          var m0 = this.xRange.invert(d3.mouse(this.domNode)[0]),
            i = this.bisectM(elevations, m0, 1),
            dElevations0 = elevations[i - 1],
            dElevations1 = elevations[i],
            dElevations = m0 - dElevations0.m > dElevations1.m - m0 ? dElevations1 : dElevations0;
          focus.select("text").text(this.formatValue(dElevations.z));
          focus.attr("transform", "translate(" + this.xRange(dElevations.m) + "," + (this.yTranslate + this.yRange(dElevations.z)) + ")");

          // Update the location of the marker graphic
          // Get the m value from the screen coordinates
          // Then find the index of its corresponding elevation info
          // Then use the index to look up for the location info
          // Finally, use the location info to update the location of the locationGraphic
          var m = this.xRange.invert(d3.mouse(this.domNode)[0]);
          i = this.bisectM(elevations, m, 1);
          var location = locations[i];
          this.chartLocationGraphic.setGeometry(new Point(location.x, location.y, this.mapWidgetProxy.spatialReference));
          this.graphicsLayerProxy.addOrUpdateGraphic(this.chartLocationGraphic);

          // Slide the vertical line along the x axis as the mouse moves:
          // Calculate the x-value (this.xRange(m)) of the line.
          // If x < this.margins.left (i.e. on the left side of the y-axis),
          // move the line offscreen (-1); Otherwise, slide the line as the mouse move
          var x = this.xRange(m) < this.margins.left? -1 : this.xRange(m);
          this.profileGraph.select(".yLine")
            .attr("x1", x)
            .attr("x2", x);
        }));
    },

    clearResult: function(){
      // Called when the "Clear Profile Graph" button is clicked
      // The profile graph and the map graphics will be cleared,
      // and the widget will be reset to the start up state

      this.profileGraph.selectAll("g").remove();
      this.profileGraph.selectAll("path").remove();
      this.profileGraph.select("line").remove();
      this.profileGraph.select("text").remove();
      this.profileGraph.select("rect").remove();

      this.graphicsLayerProxy.clear();

      this.showStartupPage();
    },

    getUnitConstant: function(){
      // Return the unit constant based on the given string
      // Default is Units.Miles
      if(this.unit === "Kilometers")
        return Units.KILOMETERS;
      else if(this.unit === "Miles")
        return Units.MILES;
    },

    convertMFromMeter: function(valueInMeter){
      // Convert the distance value (in meters) based on the unit setting
      if(this.unit == "Kilometers")
        return valueInMeter * 0.001;
      else if(this.unit == "Miles")
        return valueInMeter * 0.000621371;
    },

    convertZFromMeter: function(valueInMeter){
      // Convert the height value (in meters) to feet if the distance unit is miles
      if(this.unit == "Kilometers")
        return valueInMeter;
      else if(this.unit == "Miles")
        return valueInMeter * 3.28084;
    },

    getYAxisLabel: function(){
      // Return the y-axis label based on the distance unit
      if(this.unit === "Kilometers")
        return "meters";
      else if(this.unit === "Miles")
        return "feet";
    },

    formatValue: function(d) {
      var formatValue = d3.format(",.3f");
      return formatValue(d) + " " + this.unit;
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