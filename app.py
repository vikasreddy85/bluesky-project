from shiny import App, render, ui, reactive
import pandas as pd
import lets_plot as lp
from lets_plot import *
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import mysql.connector

from starlette.applications import Starlette
from starlette.responses import HTMLResponse
from starlette.staticfiles import StaticFiles
from starlette.routing import Mount, Route
app_static = StaticFiles(directory="/Users/vikas/Desktop/bluesky-project/")

db = mysql.connector.connect()
cursor = db.cursor()
columns_as_arrays = []

try:
    query = "SELECT Day, TotalMessages, TotalLinks, NewsGreaterThan60, NewsLessThan60 FROM bsky_news"
    cursor.execute(query)
    results = cursor.fetchall()
    columns_as_arrays = list(map(list, zip(*results)))
    day_array = columns_as_arrays[0]
    day_array_dt = pd.to_datetime(day_array)
    rounded_day_array = day_array_dt.round('H')
    rounded_day_array = [dt.strftime('%Y-%m-%d %H:%M') for dt in rounded_day_array]
    total_messages_array = columns_as_arrays[1]
    total_links_array = columns_as_arrays[2]
    news_greater_than_60_array = columns_as_arrays[3]
    news_less_than_60_array = columns_as_arrays[4]
    relative_news_greater_than_60_array = [
    news_greater_than_60_array / total_links if total_links != 0 else 0
    for news_greater_than_60_array, total_links in zip(news_greater_than_60_array, total_links_array)]
    relative_news_less_than_60_array = [
    news_less_than_60_array / total_links if total_links != 0 else 0
    for news_less_than_60_array, total_links in zip(news_less_than_60_array, total_links_array)]
except mysql.connector.Error as err:
    print(f"Error executing query: {err}")
finally:
    cursor.close()
    db.close()

start_date7 = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
start_date30 = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
end_date = (datetime.now()).strftime("%Y-%m-%d")
min_date = "2023-12-08"
app_ui = ui.page_fluid(
    ui.panel_title("Skywatch"), ui.tags.style(
        """
        @import url('https://fonts.googleapis.com/css2?family=Jost:wght@500&display=swap');
        body {
            font-family: Jost;
        }

        h2{
            margin-top: 20px;
            margin-bottom: 10px;
        }
        
        .radio-inline, .radio-inline+.radio-inline {margin-top: 12px;}
        #daterange{disabled: True}
        """
    ),
    ui.layout_sidebar(
        ui.panel_sidebar(
            ui.tags.div(
                ui.tags.div(
                    ui.output_ui("head_text"),
                    style='font-size: 24px;'
                ),
                ui.tags.p(
                    "This chart shows a real-time assessment of the \"weather conditions\" of Bluesky as a news platform. Using the Bluesky Firehose API, we track the amount of news content that is being posted by users on bsky.social. The chart shows the amount of reliable and unreliable news out of all posts sharing any external content."
                ),
                ui.output_ui("sub_text"),
                style='border: 2px solid #ccc; border-radius: 10px; padding: 20px;'
            ),
            ui.tags.div(
                ui.tags.div(
                    ui.tags.h3("Visualization controls"),
                    style = 'font-size = 24px; margin-bottom: -17px;'
                ),
                ui.tags.div(
                    ui.tags.div(
                        ui.tags.h5("Frequency: "),
                        style='display:inline-block; margin-right: 75px; margin-top: 10px;'
                    ),
                    ui.tags.div(
                        ui.input_selectize(
                            "dataset",
                            ui.tags.div(
                                None,
                                style = 'margin-top: -50px; margin-bottom: -50px;'
                            ),
                            {'Hour': 'Hourly', 'Day': 'Daily'},
                        ),
                        style='display:inline-block; min-width: 31.5%;'
                    ),
                ),
                ui.tags.div(
                    ui.tags.div(
                        ui.tags.h5("Display data from: "),
                        style="padding-right: 70px; margin-bottom: 35px;"
                    ),
                    ui.tags.div(
                        ui.input_radio_buttons(
                            "time",
                            ui.tags.div(
                                None,
                                style='margin-bottom: -12px;'
                            ),
                            {"seven": "Last 7 days",
                            "thirty": "Last 30 days",
                            "all": "All the data",
                            "custom": "Custom range "},
                        ),
                        ui.input_date_range(
                            "daterange",
                            None,
                            start="2023-12-08",
                            end=end_date,
                            min="2023-12-08",
                            max=end_date,
                            width="100%"
                        ),     
                        style="margin-bottom: 35px;"             
                    ),
                    style='display: flex; flex-direction: row; align-items: center;'
                ),
                ui.tags.div(
                    ui.input_radio_buttons(
                        "value",
                        ui.tags.div(
                            ui.tags.h5("Show y-axis as: "),
                            style = 'margin-bottom: -12px;'
                        ),
                        {"relative": "Relative values", 
                         "absolute": "Absolute values"},
                        inline=True,
                        selected="relative"
                    ),
                ),

                style='border: 2px solid #ccc; border-radius: 10px; padding-bottom: 10px; padding-right: 20px; padding-left: 20px; padding-top: 10px;'
            ),
        ),
        ui.panel_main(
            ui.output_ui("about"),
            ui.output_ui("overlayText"),
            ui.output_ui("letsplot")
        )
    )
)

def server(input, output, session):
    @output(id='letsplot')
    @render.ui
    def compute():
        selection = input.dataset()
        radio = input.time()
        chart = input.value()
        date = input.daterange()
        df_data = {
            'Day': rounded_day_array,
            'TotalMessages': total_messages_array, 
            'TotalLinks': total_links_array,
            'NewsGreaterThan60': news_greater_than_60_array,
            'NewsLessThan60': news_less_than_60_array,
            'RelativeNewsGreaterThan60': relative_news_greater_than_60_array,
            'RelativeNewsLessThan60': relative_news_less_than_60_array
        }
        df = pd.DataFrame(df_data)
        df['Timestamp'] = df['Day'].str.extract(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2})')
        df['Timestamp'] = pd.to_datetime(df['Timestamp'], format='%Y-%m-%d %H:%M', errors='coerce')
        df = df[df['Timestamp'].dt.strftime("%Y-%m-%d") != '2023-12-07']

        df['TotalMessagesDaily'] = df.groupby(df['Timestamp'].dt.date)['TotalMessages'].transform('sum')
        df['DateAndTotalMessages'] = df['Timestamp'].dt.strftime('%Y-%m-%d')
        df['TotalLinksDaily'] = df.groupby(df['Timestamp'].dt.date)['TotalLinks'].transform('sum')
        df['NewsGreaterThan60Daily'] = df.groupby(df['Timestamp'].dt.date)['NewsGreaterThan60'].transform('sum')
        df['NewsLessThan60Daily'] = df.groupby(df['Timestamp'].dt.date)['NewsLessThan60'].transform('sum')

        df['NumTimestampsDaily'] = df.groupby(df['Timestamp'].dt.date)['Timestamp'].transform('count')
        df['RelativeNewsGreaterThan60Daily'] = df.groupby(df['Timestamp'].dt.date)['RelativeNewsGreaterThan60'].transform('sum') / df['NumTimestampsDaily']
        df['RelativeNewsLessThan60Daily'] = df.groupby(df['Timestamp'].dt.date)['RelativeNewsLessThan60'].transform('sum') / df['NumTimestampsDaily']
        df = df.drop(columns=['NumTimestampsDaily'])
        df['Day2'] = df['Day']
        df["Day2"] = pd.to_datetime(df["Day2"]).dt.strftime('%b %d %Y %H:%M')
        df['Day'] = pd.to_datetime(df['Day'])
        df['DateAndTotalMessages2'] = df["DateAndTotalMessages"]
        df['DateAndTotalMessages'] = pd.to_datetime(df['DateAndTotalMessages'])

        df2 = df[pd.to_datetime(df['Timestamp'].dt.date) >= start_date7].copy()
        df3 = df[pd.to_datetime(df['Timestamp'].dt.date) >= start_date30].copy()
        df4 = df[(df['Timestamp'].dt.date >= date[0]) & (df['Timestamp'].dt.date <= date[1])].copy()
        date_difference = relativedelta(date[1], date[0])
        months_difference = date_difference.months
        days_difference = date_difference.days

        first_date_as_string = rounded_day_array[0]
        last_date_as_string = rounded_day_array[-1]
        first_date_as_datetime = pd.to_datetime(first_date_as_string)
        last_date_as_datetime = pd.to_datetime(last_date_as_string)
        all_date_difference = relativedelta(last_date_as_datetime, first_date_as_datetime)
        all_months_difference = all_date_difference.months
        tooltips = layer_tooltips().format('Day', '%b %d %Y')
        custom_tooltips = layer_tooltips().format('Day2', '%b %d %Y')
        tooltips_hour = layer_tooltips().format('Day2', '%b %d %Y %H:%M')
        dtooltips = layer_tooltips().format('DateAndTotalMessages', '%b %d %Y')
        dcustom_tooltips = layer_tooltips().format('DateAndTotalMessages2', '%b %d %Y')
        dtooltips_hour = layer_tooltips().format('DateAndTotalMessages2', '%b %d %Y %H:%M')
        if selection == 'Hour':
            if radio == "seven":
                if chart == "absolute":
                    p = (
                        lp.ggplot(df2)
                        + lp.geom_area(lp.aes(x='Day', y='NewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='NewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='TotalLinks'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity", tooltips=tooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Number of Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                elif chart == "relative":
                    p = (
                        lp.ggplot(df2)
                        + lp.geom_area(lp.aes(x='Day', y='RelativeNewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.45, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='RelativeNewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.4, position="identity", tooltips=tooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Proportion of News Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                else:
                    raise ValueError(f'{chart=} is not valid.')
                p = p + lp.scale_x_datetime(format='%b %e %Y')
            if radio == "thirty":
                if chart == "absolute":
                    p = (
                        lp.ggplot(df3)
                        + lp.geom_area(lp.aes(x='Day', y='NewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='NewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='TotalLinks'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity", tooltips=tooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Number of Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                elif chart == "relative":
                    p = (
                        lp.ggplot(df3)
                        + lp.geom_area(lp.aes(x='Day', y='RelativeNewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.45, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='RelativeNewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.4, position="identity", tooltips=tooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Proportion of News Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                else:
                    raise ValueError(f'{chart=} is not valid.')
                p = p + lp.scale_x_datetime(format='%b %e %Y')
            elif radio == "all":
                if chart == "absolute":
                    p = (
                        lp.ggplot(df)
                        + lp.geom_area(lp.aes(x='Day', y='NewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='NewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='TotalLinks'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity", tooltips=tooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Number of Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                elif chart == "relative":
                    p = (
                        lp.ggplot(df)
                        + lp.geom_area(lp.aes(x='Day', y='RelativeNewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.45, position="identity", tooltips=tooltips)
                        + lp.geom_area(lp.aes(x='Day', y='RelativeNewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.4, position="identity", tooltips=tooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Proportion of News Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                else:
                    raise ValueError(f'{chart=} is not valid.')    
                if all_months_difference >= 3:
                    p = p + lp.scale_x_datetime(format='%b %Y')
                else:
                    p = p + lp.scale_x_datetime(format='%b %e %Y')
            elif radio == "custom":
                if months_difference != 0 or days_difference > 5:
                    df4['Day2'] = pd.to_datetime(df4['Day2'])  
                    tool = custom_tooltips
                else:
                    tool = tooltips_hour
 
                if chart == "absolute":
                    p = (
                        lp.ggplot(df4)
                        + lp.geom_area(lp.aes(x='Day2', y='NewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity", tooltips=tool)
                        + lp.geom_area(lp.aes(x='Day2', y='NewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity", tooltips=tool)
                        + lp.geom_area(lp.aes(x='Day2', y='TotalLinks'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity", tooltips=tool)
                        + lp.ggsize(1865 // 2, 980 // 1.65)
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Number of Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                elif chart == "relative":
                    p = (
                        lp.ggplot(df4)
                        + lp.geom_area(lp.aes(x='Day2', y='RelativeNewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.45, position="identity", tooltips=tool)
                        + lp.geom_area(lp.aes(x='Day2', y='RelativeNewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.4, position="identity", tooltips=tool)
                        + lp.ggsize(1865 // 2, 980 // 1.65)
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Proportion of News Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                else:
                    raise ValueError(f'{chart=} is not valid.')
                print(months_difference)
                if all_months_difference >= 3:
                    p = p + lp.scale_x_datetime(format='%b %Y')
                elif (months_difference != 0 or days_difference > 5):
                    p = p + lp.scale_x_datetime(format='%b %d %Y')
        elif selection == 'Day':
            if radio == "thirty":
                if chart == "absolute":
                    p = (
                        lp.ggplot(df3)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='NewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='NewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='TotalLinksDaily'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity", tooltips=dtooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)     
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Number of Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                elif chart == "relative":
                    p = (
                        lp.ggplot(df3)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='RelativeNewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.45, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='RelativeNewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.4, position="identity", tooltips=dtooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)     
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Proportion of News Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                else:
                    raise ValueError(f'{chart=} is not valid.')
                p = p + lp.scale_x_datetime(format='%b %e %Y')
            elif radio == "seven":
                if chart == "absolute":
                    p = (
                        lp.ggplot(df2)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='NewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='NewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='TotalLinksDaily'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity", tooltips=dtooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)     
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Number of Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                elif chart == "relative":
                    p = (
                        lp.ggplot(df2)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='RelativeNewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.45, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='RelativeNewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.4, position="identity", tooltips=dtooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)     
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Proportion of News Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                else:
                    raise ValueError(f'{chart=} is not valid.')
                p = p + lp.scale_x_datetime(format='%b %e %Y')
            elif radio == "all":
                if chart == "absolute":
                    p = (
                        lp.ggplot(df)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='NewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='NewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='TotalLinksDaily'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity", tooltips=dtooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)     
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Number of Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                elif chart == "relative":
                    p = (
                        lp.ggplot(df)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='RelativeNewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.45, position="identity", tooltips=dtooltips)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='RelativeNewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.4, position="identity", tooltips=dtooltips)
                        + lp.ggsize(1865 // 2, 980 // 1.65)     
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Proportion of News Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                else:
                    raise ValueError(f'{chart=} is not valid.')
                if all_months_difference >= 3:
                    p = p + lp.scale_x_datetime(format='%b %Y')
                else:
                    p = p + lp.scale_x_datetime(format='%b %e %Y')
            elif radio == "custom":
                if months_difference != 0 or days_difference > 5:
                    df4['DateAndTotalMessages2'] = pd.to_datetime(df4['DateAndTotalMessages2'])  
                    tool = dcustom_tooltips
                else:
                    tool = dtooltips_hour
                if chart == "absolute":
                    p = (
                        lp.ggplot(df4)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages2', y='NewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity", tooltips=tool)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages2', y='NewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity", tooltips=tool)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages2', y='TotalLinksDaily'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity", tooltips=tool)
                        + lp.ggsize(1865 // 2, 980 // 1.65)     
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Number of Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                elif chart == "relative":
                    p = (
                        lp.ggplot(df4)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages2', y='RelativeNewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.45, position="identity", tooltips=tool)
                        + lp.geom_area(lp.aes(x='DateAndTotalMessages2', y='RelativeNewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.4, position="identity", tooltips=tool)
                        + lp.ggsize(1865 // 2, 980 // 1.65)     
                        + lp.theme(axis_text_x=lp.element_text(angle=360, hjust=1))
                        + lp.xlab("Date")
                        + lp.ylab("Proportion of News Links")
                        + lp.theme(text=lp.element_text(family='Georgia'))
                        + lp.theme(panel_grid_major_x=lp.element_blank())
                    )
                else:
                    raise ValueError(f'{chart=} is not valid.')
                if all_months_difference >= 3:
                    p = p + lp.scale_x_datetime(format='%b %Y')
                elif (months_difference != 0 and days_difference > 5):
                    p = p + lp.scale_x_datetime(format='%b %d %Y')
        else:
            raise ValueError(f'{selection=} is not valid.')

        @output(id='head_text')
        @render.ui
        def head_text():
            radio = input.time()
            if (radio == "seven"):
                emoji_val = df2["RelativeNewsLessThan60"].mean()
            elif (radio == "thirty"):
                emoji_val = df3["RelativeNewsLessThan60"].mean()
            elif (radio == "all"):
                emoji_val = df["RelativeNewsLessThan60"].mean()
            elif (radio == "custom"):
                emoji_val = df4["RelativeNewsLessThan60"].mean()

            weather_mapping = {
                (0.0, 0.10): "☀️",
                (0.10, 0.20): "🌤️",
                (0.20, 0.30): "⛅️",
                (0.30, 0.40): "☁️",
                (0.40, 0.50): "🌦️",
                (0.50, 0.60): "🌧️",
                (0.60, 0.70): "🌩️",
                (0.70, 0.80): "⛈️",
                (0.80, 0.90): "🌨️",
                (0.90, 1.00): "🌪️",
            }
            condition = next((value for key, value in weather_mapping.items() if key[0] < emoji_val <= key[1]), None)

            if condition:
                x = ui.tags.p(f"Current conditions (last 7 days): {condition}")
            else:
                return ui.tags.p("Invalid emoji value")
            return x
        
        @output(id='about')
        @render.ui
        @reactive.event(input.value)
        def about():
            return (ui.tags.div(
                    ui.HTML('<a href="/about" target="_blank">About</a>'),
                        style = "display: flex; justify-content: flex-end; margin-bottom: -10px;"),
                    )
        
        @output(id='sub_text')
        @render.ui
        def sub_text():
            radio = input.time()
            if (radio == "seven"):
                emoji_val = df2["RelativeNewsLessThan60"].mean()
            elif (radio == "thirty"):
                emoji_val = df3["RelativeNewsLessThan60"].mean()
            elif (radio == "all"):
                emoji_val = df["RelativeNewsLessThan60"].mean()
            elif (radio == "custom"):
                emoji_val = df4["RelativeNewsLessThan60"].mean()

            message_mapping = {
                (0.0, 0.1): "Days with sunny weather indicate that unreliable news sources are not being posted.",
                (0.1, 0.2): "Days with partly cloudy weather may occasionally include unreliable news sources.",
                (0.2, 0.3): "Days with mostly cloudy weather may occasionally include unreliable news sources.",
                (0.3, 0.4): "Days with cloudy weather may see an increase in unreliable news sources.",
                (0.4, 0.5): "Partially rainy days could result in an increase in unreliable news sources, along with some reliable sources.",
                (0.5, 0.6): "Expect more unreliable news sources on rainy days.",
                (0.6, 0.7): "Thunderstorms may bring about an increase in unreliable news sources.",
                (0.7, 0.8): "Heavy thunderstorms may lead to a surge in unreliable news sources.",
                (0.8, 0.9): "Snowy days might see a rise in unreliable news sources.",
                (0.9, 1.0): "Tornado warnings may increase the likelihood of unreliable news sources."
            }

            # Find the appropriate message based on emoji_val
            message = next((value for key, value in message_mapping.items() if key[0] <= emoji_val <= key[1]), None)

            if message:
                return ui.tags.p(message)
            else:
                return ui.tags.p("Invalid emoji value")
        
        phtml = lp._kbridge._generate_static_html_page(p.as_dict(), iframe=True)
        return ui.HTML(phtml)

    @output(id='overlayText')
    @render.ui
    @reactive.event(input.value)
    def overlay_text():
        chart = input.value()
        if (chart == "relative"):
            return (
                ui.tags.div(
                    ui.tags.p(
                        ui.tags.span(style="color: rgba(152, 156, 216, 1.0); background-color: rgba(152, 156, 216, 1.0); padding: 0px 25px; margin-right: 10px; font-size: 12px;", _class="legend-box"),
                        "Reliable",
                        ui.tags.span(style="margin-right: 20px;"),
                        ui.tags.span(style="color: rgba(160, 92, 148, 0.95); background-color: rgba(160, 92, 148, 0.95); padding: 0px 25px; margin-right: 10px; font-size: 12px;", _class="legend-box"),
                        "Unreliable",
                    ),
                    style="display: flex; justify-content: flex-end; margin-bottom: -10px;"
                )
            )
        elif (chart == "absolute"):
            return (
                ui.tags.div(
                    ui.tags.p(
                        ui.tags.span(style="color: rgba(208, 250, 211, 1); background-color: rgba(208, 250, 211, 1); padding: 0px 25px; margin-right: 10px; font-size: 12px;", _class="legend-box"),
                        "Total",
                        ui.tags.span(style="margin-right: 20px;"),
                        ui.tags.span(style="color: rgba(56, 100, 148, 0.49); background-color: rgba(56, 100, 148, 0.49); padding: 0px 25px; margin-right: 10px; font-size: 12px;", _class="legend-box"),
                        "Reliable",
                        ui.tags.span(style="margin-right: 20px;"),
                        ui.tags.span(style="color: rgba(184, 116, 92, 0.65); background-color: rgba(184, 116, 92, 0.65); padding: 0px 25px; margin-right: 10px; font-size: 12px;", _class="legend-box"),
                        "Unreliable",
                    ),
                    style="display: flex; justify-content: flex-end; margin-bottom: -10px;"
                )
            )
    
    @reactive.Effect
    @reactive.event(input.dataset)
    def _():
        selection = input.dataset()
        radio = input.time()
        if selection == "Hour":
            ui.update_radio_buttons("time", selected="seven")
        elif selection == "Day":
            ui.update_radio_buttons("time", selected="thirty")

app_shiny = App(app_ui, server)

async def about(request):
    with open("about.html", "r", encoding="utf-8") as file:
        html_content = file.read()
    return HTMLResponse(content=html_content)

routes = [
    Route('/about', endpoint=about),
    Mount('/', app=app_shiny)
]

app = Starlette(routes=routes)
