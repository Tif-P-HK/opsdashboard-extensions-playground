define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/store/Memory",
  "dijit/_WidgetBase",
  "dijit/_TemplatedMixin",
  "dijit/_WidgetsInTemplateMixin",
  "esri/opsdashboard/WidgetConfigurationProxy",
  "dojo/text!./elevationProfileWidgetConfigTemplate.html",
  "dijit/form/Select"
], function (declare, lang, Memory, _WidgetBase, _TemplatedMixin,_WidgetsInTemplateMixin,  WidgetConfigurationProxy, templateString) {

  return declare("elevationProfileWidgetConfig", [_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, WidgetConfigurationProxy], {
    templateString: templateString,

    constructor: function(){
      // Available distance units
      this.distanceUnitsStore = new Memory({
        idProperty: "id",
        data: [
          {"id": "Miles", value: "US Standard"},
          {"id": "Kilometers", value: "Metric"}
        ]
      });

      this.dataSourceConfig = null;
    },

    postCreate: function(){
      this.inherited(arguments);

      this.unitCombo.set("labelAttr", "value");
      this.unitCombo.set("store", this.distanceUnitsStore);
    },

    hostInitializationError: function(err){
      console.log("Error occurred during the initialization process with Operations Dashboard" + err);
    },

    dataSourceSelectionChanged: function (dataSourceProxy, dataSourceConfig) {
      console.log("in dataSourceSelectionChanged");

      this.dataSourceConfig = dataSourceConfig;

      // Set previous field saved in config or set to default
      if (this.dataSourceConfig.distanceUnit)
        this.unitCombo.set("value", dataSourceConfig.distanceUnit);
      else
        this.unitCombo.set("value", this.distanceUnitsStore.data[0]["id"]);

      this.readyToPersistConfig(true);
    },

    selectedUnitChanged: function (value) {
      if(this.dataSourceConfig)
        this.dataSourceConfig.distanceUnit = value;
      this.readyToPersistConfig(true);
    }
  });
});
