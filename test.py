from shiny import App, render, ui, reactive
import requests
import pandas as pd
import lets_plot as lp

app_ui = ui.page_fluid(
    ui.panel_title("Bluesky Source Credibility and Transparency Assessment Visualization"), ui.tags.style(
        """
        @import url('https://fonts.googleapis.com/css2?family=Jost:wght@500&display=swap');
        body {
            font-family: Jost
        }

        h2{
            margin-top: 20px;
            margin-bottom: 10px;
        }

        h5{
            margin-top: 13px;
            margin-bottom: 12px;
        }
        """
    ),
    ui.layout_sidebar(
        ui.panel_sidebar(
            ui.input_selectize(
                "dataset",
                ui.tags.h4("Select Hourly or Daily Visualization"),
                {'Hour': 'Hourly', 'Day': 'Daily'},
            ),
            ui.tags.div(
                ui.tags.h5("Are Your News Sources Reliable?"),
                ui.tags.p(
                    "The following chart offers a real-time assessment of the trustworthiness of news sources on the emerging social media platform Bluesky. Utilizing the NewsGuard rating system, each link is cross-referenced with the database compiled by NewsGuard's team of journalists, assessing the website’s credibility and transparency. Scores above 60 signify that the source adheres to basic standards of credibility and transparency, while scores below 60 indicate that the source is deemed unreliable and in violation of basic journalistic standards."
                ),
                ui.tags.div(
                    ui.tags.h5("Legend"),
                    ui.tags.p(
                        ui.tags.span(style="color: rgba(131, 242, 143, 0.4); background-color: rgba(131, 242, 143, 0.4); padding: 0px 35px; margin-right: 20px; font-size: 12px;", _class="legend-box"),
                        "Total Number of Links",
                    ),
                    ui.tags.p(
                        ui.tags.span(style="color: rgba(0, 0, 139, 0.25); background-color: rgba(0, 0, 139, 0.25); padding: 0px 35px; margin-right: 20px; font-size: 12px;", _class="legend-box"),
                        "Number of Links with NewsGuard Rating Greater Than 60",
                    ),
                    ui.tags.p(
                        ui.tags.span(style="color: rgba(255, 0, 0, 0.3); background-color: rgba(255, 0, 0, 0.35); padding: 0px 35px; margin-right: 20px; font-size: 12px;", _class="legend-box"),
                        "Number of Links with NewsGuard Rating Less Than 60",
                    ),
                )


            )
        ),
        ui.panel_main(
            ui.output_ui("letsplot")
        )
    )
)

def server(input, output, session):
    @output(id='letsplot')
    @render.ui
    @reactive.event(input.dataset)
    def compute():
        selection = input.dataset()
        response = requests.get("http://10.224.109.230:3001/get_data")     
        if response.status_code == 200:
            data = response.json()
            columns_as_array = list(map(list, zip(*data))) 
        else:
            print("Error fetching data. Status code:", response.status_code)
        day_array = columns_as_array[0]
        day_array_dt = pd.to_datetime(day_array)
        rounded_day_array = day_array_dt.round('H')
        rounded_day_array = [dt.strftime('%Y-%m-%d %H:%M') for dt in rounded_day_array]
        total_messages_array = columns_as_array[1]
        total_links_array = columns_as_array[2]
        news_greater_than_60_array = columns_as_array[3]
        news_less_than_60_array = columns_as_array[4]

        df_data = {
            'Day': [f"{day}\n {total_messages} Skeets" for day, total_messages in zip(rounded_day_array, total_messages_array)],
            'TotalMessages': total_messages_array, 
            'TotalLinks': total_links_array,
            'NewsGreaterThan60': news_greater_than_60_array,
            'NewsLessThan60': news_less_than_60_array,
        }
        df = pd.DataFrame(df_data)
        df['Timestamp'] = df['Day'].str.extract(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2})')
        df['Timestamp'] = pd.to_datetime(df['Timestamp'], format='%Y-%m-%d %H:%M', errors='coerce')
        df = df[df['Timestamp'].dt.strftime("%Y-%m-%d") != '2023-12-07']
        df['TotalMessagesDaily'] = df.groupby(df['Timestamp'].dt.date)['TotalMessages'].transform('sum')
        df['DateAndTotalMessages'] = df['Timestamp'].dt.strftime('%Y-%m-%d') + '\n(' + df['TotalMessagesDaily'].astype(str) + 'M)'
        df['TotalLinksDaily'] = df.groupby(df['Timestamp'].dt.date)['TotalLinks'].transform('sum')
        df['NewsGreaterThan60Daily'] = df.groupby(df['Timestamp'].dt.date)['NewsGreaterThan60'].transform('sum')
        df['NewsLessThan60Daily'] = df.groupby(df['Timestamp'].dt.date)['NewsLessThan60'].transform('sum')
        
        df = df.drop(columns=['Timestamp'])
        if selection == 'Hour':
            p = (
                lp.ggplot(df)
                + lp.geom_area(lp.aes(x='Day', y='NewsLessThan60'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity")
                + lp.geom_area(lp.aes(x='Day', y='NewsGreaterThan60'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity")
                + lp.geom_area(lp.aes(x='Day', y='TotalLinks'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity")
                + lp.ggsize(2280 // 2, 1080 // 1.65)
                + lp.theme(axis_text_x=lp.element_text(angle=45, hjust=1))
                + lp.xlab("Hour")
                + lp.ylab("Number of Links")
                + lp.ggtitle("Hourly Analysis of Trustworthy vs Untrustworthy Links on Bluesky")
                + lp.theme(text=lp.element_text(family='Georgia'))
                + lp.theme(panel_grid_major_x=lp.element_blank())
                + lp.layout(margin=dict(b=90))
            )
        elif selection == 'Day':
            p = (
                lp.ggplot(df)
                + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='NewsLessThan60Daily'), size=1, color='#FF0000', fill='#FF0000', alpha=0.30, position="identity")
                + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='NewsGreaterThan60Daily'), size=1, color='#00008B', fill='#00008B', alpha=0.25, position="identity")
                + lp.geom_area(lp.aes(x='DateAndTotalMessages', y='TotalLinksDaily'), size=1, color='#83F28F', fill='#83F28F', alpha=0.40, position="identity")
                + lp.ggsize(1920 // 2, 1080 // 1.65)     
                + lp.theme(axis_text_x=lp.element_text(angle=45, hjust=1))
                + lp.xlab("Date")
                + lp.ylab("Number of Links")
                + lp.ggtitle("Daily Analysis of Trustworthy vs Untrustworthy Links on Bluesky")
                + lp.theme(text=lp.element_text(family='Georgia'))
                + lp.theme(panel_grid_major_x=lp.element_blank())
            )
        else:
            raise ValueError(f'{selection=} is not valid.')
        phtml = lp._kbridge._generate_static_html_page(p.as_dict(), iframe=True)
        return ui.HTML(phtml)

app = App(app_ui, server)